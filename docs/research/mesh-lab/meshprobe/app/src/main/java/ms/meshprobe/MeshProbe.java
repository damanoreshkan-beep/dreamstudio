package ms.meshprobe;

// MeshProbe — the smallest thing that answers the only question worth asking before Ф1b:
// CAN OUR OWN CODE JOIN THE BITCHAT MESH? Not "does bitchat work" (it does, proven), not how its UI looks
// (Playwright's job on our web half). This has no UI, no product logic and no vendored foreign code: it
// scans for bitchat's service, connects, subscribes, and decodes the real frames with OUR OWN parser,
// written from the wire spec in docs/research/ble-mesh.md §8. Everything it learns goes to logcat.
//
//   adb logcat -s MESHPROBE:V
//
// Java, no AndroidX, minSdk 26 — deliberately the same shape as the shell template, so what survives here
// moves into the `mesh` flavour in Ф1b instead of being rewritten.

import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattDescriptor;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothManager;
import android.bluetooth.le.AdvertiseCallback;
import android.bluetooth.le.AdvertiseData;
import android.bluetooth.le.AdvertiseSettings;
import android.bluetooth.le.BluetoothLeAdvertiser;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanFilter;
import android.bluetooth.le.ScanResult;
import android.bluetooth.le.ScanSettings;
import android.content.Context;
import android.os.ParcelUuid;
import android.util.Log;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

public class MeshProbe {
    public static final String TAG = "MESHPROBE";

    // The bitchat wire, read from its source (AppConstants.Mesh.Gatt), not guessed.
    static final java.util.UUID SERVICE = java.util.UUID.fromString("F47B5E2D-4A9E-4C5A-9B3F-8E1D2C3A4B5C");
    static final java.util.UUID CHARACTERISTIC = java.util.UUID.fromString("A1B2C3D4-E5F6-4A5B-8C9D-0E1F2A3B4C5D");
    static final java.util.UUID CCCD = java.util.UUID.fromString("00002902-0000-1000-8000-00805f9b34fb");

    private final Context ctx;
    private BluetoothLeScanner scanner;
    private BluetoothLeAdvertiser advertiser;
    private final Set<String> seen = new HashSet<>();
    private final List<BluetoothGatt> gatts = new ArrayList<>();

    public MeshProbe(Context ctx) { this.ctx = ctx; }

    public void start() {
        BluetoothManager bm = (BluetoothManager) ctx.getSystemService(Context.BLUETOOTH_SERVICE);
        BluetoothAdapter adapter = bm == null ? null : bm.getAdapter();
        if (adapter == null || !adapter.isEnabled()) { Log.e(TAG, "no bluetooth adapter / disabled"); return; }
        Log.i(TAG, "probe start, adapter=" + adapter.getName());

        scanner = adapter.getBluetoothLeScanner();
        advertiser = adapter.getBluetoothLeAdvertiser();
        advertise();
        scan();
    }

    // Be VISIBLE as well as looking: a mesh node that only scans is half a node, and bitchat connecting to
    // us is independent evidence that our advertisement is well formed.
    private void advertise() {
        if (advertiser == null) { Log.w(TAG, "no advertiser (peripheral mode unsupported)"); return; }
        AdvertiseSettings settings = new AdvertiseSettings.Builder()
                .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
                .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)
                .setConnectable(true)
                .build();
        AdvertiseData data = new AdvertiseData.Builder()
                .setIncludeDeviceName(false)                 // the name blows the 31-byte budget
                .addServiceUuid(new ParcelUuid(SERVICE))
                .build();
        try {
            advertiser.startAdvertising(settings, data, new AdvertiseCallback() {
                @Override public void onStartSuccess(AdvertiseSettings s) { Log.i(TAG, "advertising: OK"); }
                @Override public void onStartFailure(int e) { Log.e(TAG, "advertising FAILED code=" + e); }
            });
        } catch (SecurityException e) { Log.e(TAG, "advertise denied: " + e); }
    }

    private void scan() {
        if (scanner == null) { Log.e(TAG, "no scanner"); return; }
        List<ScanFilter> filters = new ArrayList<>();
        filters.add(new ScanFilter.Builder().setServiceUuid(new ParcelUuid(SERVICE)).build());
        ScanSettings settings = new ScanSettings.Builder()
                .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build();
        try {
            scanner.startScan(filters, settings, new ScanCallback() {
                @Override public void onScanResult(int type, ScanResult r) {
                    BluetoothDevice d = r.getDevice();
                    String addr = d.getAddress();
                    if (!seen.add(addr)) return;            // one connect per address, not one per advert
                    Log.i(TAG, "FOUND peer addr=" + addr + " rssi=" + r.getRssi());
                    connect(d);
                }
                @Override public void onScanFailed(int e) { Log.e(TAG, "scan FAILED code=" + e); }
            });
            Log.i(TAG, "scanning for " + SERVICE);
        } catch (SecurityException e) { Log.e(TAG, "scan denied: " + e); }
    }

    private void connect(BluetoothDevice d) {
        try {
            gatts.add(d.connectGatt(ctx, false, new BluetoothGattCallback() {
                @Override public void onConnectionStateChange(BluetoothGatt g, int status, int newState) {
                    Log.i(TAG, "gatt state=" + newState + " status=" + status + " " + g.getDevice().getAddress());
                    if (newState == BluetoothGatt.STATE_CONNECTED) {
                        // Ask for the big MTU FIRST: bitchat frames run to ~500 bytes and the default 23
                        // would silently truncate every notification into uselessness.
                        g.requestMtu(517);
                    }
                }
                @Override public void onMtuChanged(BluetoothGatt g, int mtu, int status) {
                    Log.i(TAG, "mtu=" + mtu + " status=" + status);
                    g.discoverServices();
                }
                @Override public void onServicesDiscovered(BluetoothGatt g, int status) {
                    BluetoothGattService svc = g.getService(SERVICE);
                    if (svc == null) { Log.e(TAG, "service NOT found on " + g.getDevice().getAddress()); return; }
                    BluetoothGattCharacteristic ch = svc.getCharacteristic(CHARACTERISTIC);
                    if (ch == null) { Log.e(TAG, "characteristic NOT found"); return; }
                    g.setCharacteristicNotification(ch, true);
                    BluetoothGattDescriptor cccd = ch.getDescriptor(CCCD);
                    if (cccd != null) {
                        cccd.setValue(BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE);
                        g.writeDescriptor(cccd);
                    }
                    Log.i(TAG, "SUBSCRIBED to " + g.getDevice().getAddress());
                }
                @Override public void onCharacteristicChanged(BluetoothGatt g, BluetoothGattCharacteristic ch) {
                    byte[] v = ch.getValue();
                    Log.i(TAG, "FRAME " + v.length + "B from " + g.getDevice().getAddress() + " :: " + describe(v));
                    Log.v(TAG, "  hex=" + hex(v, 32));
                }
            }));
        } catch (SecurityException e) { Log.e(TAG, "connect denied: " + e); }
    }

    // OUR OWN decoder — this is the actual claim under test. Layout from BinaryProtocol.encode:
    // [version 1][type 1][ttl 1][timestamp 8 BE][flags 1][payloadLen 2 (v1) or 4 (v2+)] then senderID 8,
    // recipientID 8 if HAS_RECIPIENT, payload, signature 64 if HAS_SIGNATURE.
    static String describe(byte[] b) {
        if (b == null || b.length < 14) return "short frame";
        int ver = b[0] & 0xFF, type = b[1] & 0xFF, ttl = b[2] & 0xFF;
        long ts = ByteBuffer.wrap(b, 3, 8).order(ByteOrder.BIG_ENDIAN).getLong();
        int flags = b[11] & 0xFF;
        int hdr = (ver == 1) ? 14 : 16;
        if (b.length < hdr + 8) return "truncated header";
        long payLen = (ver == 1)
                ? (((long) (b[12] & 0xFF) << 8) | (b[13] & 0xFF))
                : (((long) (b[12] & 0xFF) << 24) | ((long) (b[13] & 0xFF) << 16)
                   | ((long) (b[14] & 0xFF) << 8) | (b[15] & 0xFF));
        String sender = hexRange(b, hdr, 8);
        boolean hasRecipient = (flags & 0x01) != 0, hasSig = (flags & 0x02) != 0;
        boolean compressed = (flags & 0x04) != 0, hasRoute = (flags & 0x08) != 0;
        String recipient = hasRecipient && b.length >= hdr + 16 ? hexRange(b, hdr + 8, 8) : "-";
        return "v" + ver + " " + typeName(type) + " ttl=" + ttl + " sender=" + sender
                + " to=" + (isBroadcast(recipient) ? "BROADCAST" : recipient)
                + " len=" + payLen + " ts=" + ts
                + (hasSig ? " signed" : "") + (compressed ? " gz" : "") + (hasRoute ? " routed" : "");
    }

    static boolean isBroadcast(String hexRecipient) { return "ffffffffffffffff".equalsIgnoreCase(hexRecipient); }

    static String typeName(int t) {
        switch (t) {
            case 0x01: return "ANNOUNCE";
            case 0x02: return "MESSAGE";
            case 0x03: return "LEAVE";
            case 0x10: return "NOISE_HANDSHAKE";
            case 0x11: return "NOISE_ENCRYPTED";
            case 0x20: return "FRAGMENT";
            case 0x21: return "REQUEST_SYNC";
            case 0x22: return "FILE_TRANSFER";
            case 0x29: return "VOICE_FRAME";
            default: return "type0x" + Integer.toHexString(t);
        }
    }

    static String hexRange(byte[] b, int off, int n) {
        StringBuilder s = new StringBuilder();
        for (int i = off; i < off + n && i < b.length; i++) s.append(String.format("%02x", b[i]));
        return s.toString();
    }

    static String hex(byte[] b, int max) {
        StringBuilder s = new StringBuilder();
        for (int i = 0; i < b.length && i < max; i++) s.append(String.format("%02x", b[i]));
        if (b.length > max) s.append("…+").append(b.length - max);
        return s.toString();
    }
}
