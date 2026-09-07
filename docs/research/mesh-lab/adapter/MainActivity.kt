package ms.meshnode

// The probe host. No UI: the question this app answers is "does the vendored transport RUN under our
// toolchain and become a peer of stock bitchat", and the answer is a logcat line, not a screen.
//
//   adb logcat -s MESHNODE:V
//
// In the shell this file becomes MeshLayer: the same two registrations (a MeshSink for what comes out of
// the mesh, a delegate for what the transport asks of its host) with the bridge on the other side
// instead of Log.

import android.app.Activity
import android.os.Bundle
import android.util.Log
import android.widget.TextView
import com.bitchat.android.mesh.BluetoothMeshDelegate
import com.bitchat.android.mesh.BluetoothMeshService
import com.bitchat.android.model.BitchatMessage
import com.bitchat.android.model.DeliveryStatus
import com.bitchat.android.services.AppStateStore
import com.bitchat.android.services.MeshSink
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

class MainActivity : Activity() {

    private var mesh: BluetoothMeshService? = null
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val greeted = java.util.Collections.synchronizedSet(HashSet<String>())

    // STEP 2 of the plan: prove a PRIVATE (Noise-encrypted, end-to-end) message goes BOTH ways.
    // Outbound is what our code drives: the first time we see a verified direct peer, establish a Noise
    // session and send it one private line. sendPrivateMessage self-heals — with no session it kicks the
    // handshake, with a session it encrypts — so we initiate, wait for the session, then send.
    // Inbound is proven by the MeshSink.onPrivateMessage / delegate.didReceiveMessage(isPrivate) logs,
    // driven from the other device (stock bitchat's DM composer).
    private fun greet(peerID: String) {
        if (peerID.isBlank() || !greeted.add(peerID)) return
        val svc = mesh ?: return
        scope.launch {
            val nick = svc.getPeerNicknames()[peerID] ?: peerID
            Log.i(TAG, "GREET $peerID ($nick): initiating Noise handshake")
            svc.initiateNoiseHandshake(peerID)
            var established = false
            repeat(30) {                                   // up to ~30s; announces + handshake are chatty
                if (svc.hasEstablishedSession(peerID)) { established = true; return@repeat }
                delay(1000)
            }
            if (!established && !svc.hasEstablishedSession(peerID)) {
                Log.w(TAG, "GREET $peerID: no Noise session after 30s, sending anyway (will re-handshake)")
            } else {
                Log.i(TAG, "GREET $peerID: Noise session ESTABLISHED")
            }
            val line = "private ping from meshnode @${System.currentTimeMillis() % 100000}"
            Log.i(TAG, "SEND PRIVATE -> $peerID: $line")
            svc.sendPrivateMessage(line, peerID, nick)
        }
    }

    override fun onCreate(b: Bundle?) {
        super.onCreate(b)
        setContentView(TextView(this).apply { text = "meshnode — adb logcat -s MESHNODE:V" })
        Log.i(TAG, "=== meshnode boot ===")

        // 1. What the mesh produces goes here. In the shell this crosses the bridge to the page.
        AppStateStore.setSink(object : MeshSink {
            override fun onPeersChanged(all: Set<String>, direct: Set<String>) {
                Log.i(TAG, "PEERS all=${all.size} direct=${direct.size} $all")
            }
            override fun onPublicMessage(msg: BitchatMessage, replacing: Boolean) {
                Log.i(TAG, "PUBLIC ${if (replacing) "upd" else "new"} <${msg.sender}> ${msg.content}")
            }
            override fun onPrivateMessage(peerID: String, msg: BitchatMessage, replacing: Boolean) {
                Log.i(TAG, "PRIVATE IN from $peerID <${msg.sender}> ${msg.content}")
            }
            override fun onDeliveryStatus(messageID: String, status: DeliveryStatus) {
                Log.i(TAG, "STATUS $messageID -> $status")
            }
            override fun onMessageRemoved(messageID: String, private: Boolean) {
                Log.i(TAG, "REMOVED $messageID private=$private")
            }
        })
        AppStateStore.setNickname("meshnode")

        // 2. What the transport asks of its host. Only getNickname and isFavorite carry a real answer
        // here; the rest is what the page will handle once the bridge exists.
        val svc = BluetoothMeshService(applicationContext)
        svc.delegate = object : BluetoothMeshDelegate {
            override fun didReceiveMessage(message: BitchatMessage) {
                Log.i(TAG, "MSG ${if (message.isPrivate) "PRIVATE" else "public"} <${message.sender}> " +
                        "(from ${message.senderPeerID}) ${message.content}")
            }
            override fun didUpdatePeerList(peers: List<String>) {
                Log.i(TAG, "PEERLIST ${peers.size} $peers")
                peers.forEach { greet(it) }
            }
            override fun didReceiveChannelLeave(channel: String, fromPeer: String) {
                Log.i(TAG, "LEAVE $channel by $fromPeer")
            }
            override fun didReceiveDeliveryAck(messageID: String, recipientPeerID: String) {
                Log.i(TAG, "ACK $messageID by $recipientPeerID")
            }
            override fun didReceiveReadReceipt(messageID: String, recipientPeerID: String) {
                Log.i(TAG, "READ $messageID by $recipientPeerID")
            }
            override fun didReceiveVerifyChallenge(peerID: String, payload: ByteArray, timestampMs: Long) {}
            override fun didReceiveVerifyResponse(peerID: String, payload: ByteArray, timestampMs: Long) {}
            override fun decryptChannelMessage(encryptedContent: ByteArray, channel: String): String? = null
            override fun getNickname(): String = AppStateStore.nickname.value
            override fun isFavorite(peerID: String): Boolean = false
        }

        Log.i(TAG, "starting mesh, myPeerID=${svc.myPeerID}")
        svc.startServices()
        mesh = svc
    }

    override fun onDestroy() {
        try { mesh?.stopServices() } catch (_: Exception) { }
        super.onDestroy()
    }

    private companion object { const val TAG = "MESHNODE" }
}
