package com.bitchat.android.ui.debug

// OUR CODE, in THEIR package — the second (and last) seam of the transport-only vendoring.
//
// bitchat's DebugSettingsManager is a Compose-era developer panel: it owns four feature toggles the
// transport reads, a live scan log the transport appends to, and — the reason it cannot come across —
// references to `service.MeshServiceHolder` and the `wifiaware` stack, both of which belong to the app
// layer we deliberately left behind. The transport's actual need is small and fully enumerated below.
//
// The toggles stay permanently ON here. They exist in bitchat so a developer can switch half the radio
// off from a debug sheet; our equivalent switch is the bridge action that starts and stops the whole
// mesh, so a second, hidden way to disable the GATT server would only ever be a mystery in a log.
// `addScanResult` keeps a small ring so a future `mesh.debug` bridge action can hand the page what the
// radio is hearing, without which "nobody is nearby" and "the scanner is off" look identical.

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import android.util.Log
import java.util.Date

/** What the scanner reports for one sighting. Field-for-field as the transport constructs it. */
data class DebugScanResult(
    val deviceName: String?,
    val deviceAddress: String,
    val rssi: Int,
    val peerID: String?,
    val timestamp: Date = Date()
)

// The toggles must be real StateFlows, not a value holder: the transport does not only read `.value`,
// it `collect {}`s them to react when a switch flips (BluetoothConnectionManager:147 tears the transport
// down that way). A plain wrapper compiles as a field read and fails at the collect — measured.

class DebugSettingsManager private constructor() {

    val bleEnabled: StateFlow<Boolean> = MutableStateFlow(true).asStateFlow()
    val gattClientEnabled: StateFlow<Boolean> = MutableStateFlow(true).asStateFlow()
    val gattServerEnabled: StateFlow<Boolean> = MutableStateFlow(true).asStateFlow()
    val packetRelayEnabled: StateFlow<Boolean> = MutableStateFlow(true).asStateFlow()
    val verboseLoggingEnabled: StateFlow<Boolean> = MutableStateFlow(false).asStateFlow()

    // Link budget. bitchat exposes these so a developer can throttle a phone that is struggling; the
    // defaults are theirs (8 each). Kept as StateFlow because the transport reads `.value` on them.
    val maxConnectionsOverall: StateFlow<Int> = MutableStateFlow(8).asStateFlow()
    val maxServerConnections: StateFlow<Int> = MutableStateFlow(8).asStateFlow()
    val maxClientConnections: StateFlow<Int> = MutableStateFlow(8).asStateFlow()

    // The packet trace. Theirs renders into a debug sheet; ours goes to logcat under one tag, which is
    // the only place a transport-level trace is useful to us — the page gets peers and messages, not
    // packets. Signatures are field-for-field theirs so no vendored call site changes.
    fun logIncomingPacket(senderPeerID: String, senderNickname: String?, messageType: String, viaDeviceId: String?) {
        Log.v(TAG, "in  $messageType from ${senderNickname ?: senderPeerID} via ${viaDeviceId ?: "direct"}")
    }

    fun logOutgoing(
        packetType: String, toPeerID: String?, toNickname: String?, toDeviceAddress: String?,
        previousHopPeerID: String? = null, packetVersion: UByte = 1u, routeInfo: String? = null
    ) {
        Log.v(TAG, "out v$packetVersion $packetType to ${toNickname ?: toPeerID ?: "?"} ${routeInfo ?: ""}")
    }

    fun logPacketRelayDetailed(
        packetType: String, senderPeerID: String?, senderNickname: String?,
        fromPeerID: String?, fromNickname: String?, fromDeviceAddress: String?,
        toPeerID: String?, toNickname: String?, toDeviceAddress: String?,
        ttl: UByte?, isRelay: Boolean = true, packetVersion: UByte = 1u, routeInfo: String? = null
    ) {
        Log.v(TAG, "${if (isRelay) "relay" else "send"} $packetType ttl=$ttl " +
                "src=${senderNickname ?: senderPeerID} from=${fromPeerID ?: "?"} to=${toPeerID ?: "?"}")
    }

    fun logIncoming(
        packet: com.bitchat.android.protocol.BitchatPacket, fromPeerID: String,
        fromNickname: String?, fromDeviceAddress: String?, myPeerID: String
    ) {
        Log.v(TAG, "in  type=${packet.type} ttl=${packet.ttl} from=${fromNickname ?: fromPeerID} " +
                "addr=${fromDeviceAddress ?: "?"}")
    }

    fun logPeerConnection(peerID: String, nickname: String, deviceID: String, isInbound: Boolean) {
        Log.i(TAG, "link ${if (isInbound) "in " else "out"} $nickname ($peerID) via $deviceID")
    }

    /** Theirs lets the debug sheet show names instead of ids; we keep the hook so the call site stands. */
    fun setNicknameResolver(resolver: ((String) -> String?)?) { nicknameResolver = resolver }
    private var nicknameResolver: ((String) -> String?)? = null

    private val scans = ArrayDeque<DebugScanResult>()

    /** Newest first, capped — a debug tail, never a data store. */
    fun addScanResult(r: DebugScanResult) = synchronized(scans) {
        scans.addFirst(r)
        while (scans.size > MAX_SCANS) scans.removeLast()
    }

    /** Snapshot for whoever asks (the future `mesh.debug` action). */
    fun scanResults(): List<DebugScanResult> = synchronized(scans) { scans.toList() }

    companion object {
        private const val TAG = "MESHNODE"
        private const val MAX_SCANS = 200
        @Volatile private var instance: DebugSettingsManager? = null
        @JvmStatic
        fun getInstance(): DebugSettingsManager =
            instance ?: synchronized(this) { instance ?: DebugSettingsManager().also { instance = it } }
    }
}

/** Their fallback path when the manager is not ready yet; ours is always ready, so it answers the default. */
object DebugPreferenceManager {
    // Every one of these is a tuning knob their debug sheet can move; ours answers the default the
    // caller already passes, so the transport runs on its own designed values.
    @JvmStatic fun getBleEnabled(default: Boolean = true): Boolean = default
    @JvmStatic fun getSeenPacketCapacity(default: Int): Int = default
    @JvmStatic fun getGcsMaxFilterBytes(default: Int): Int = default
    @JvmStatic fun getGcsFprPercent(default: Double): Double = default
}
