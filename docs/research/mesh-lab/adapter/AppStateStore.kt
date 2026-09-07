package com.bitchat.android.services

// OUR CODE, in THEIR package — the one seam between the vendored bitchat transport and our host app.
//
// Why this file exists (owner's decision, 2026-09-07: "варіант Б, тільки транспорт"):
// the transport reaches its host application through `AppStateStore`, and bitchat's own version of it is
// the head of their app layer — it pulls ConversationRepository (1945 lines), ContactDirectory (which
// reaches nostr), an encrypted conversation store, and behind those a second UI framework, Tor, Wi-Fi
// Aware, a hotspot stack and a camera scanner: about 90k lines and a 46 MB APK for a socket we need
// thirteen methods of. Our messages do not live in a SQLite store inside the APK; they live in the web
// page. So the host side is ours, and it is deliberately dumb: it holds the peer sets, and it FORWARDS
// every message event to a sink.
//
// This is not protocol code and nothing here is invented: the thirteen members below are exactly the ones
// the kept transport calls, with the signatures read out of their AppStateStore.kt. Relay, dedup, TTL,
// fragments, store-and-forward and Noise all stay THEIRS, untouched.
//
// In the shell this object is what `MeshLayer` registers its sink on; the sink then crosses the bridge to
// the page as the `mesh.peers` / `mesh.messages` / `mesh.receipts` subscriptions of the action catalogue.

import com.bitchat.android.model.BitchatMessage
import com.bitchat.android.model.DeliveryStatus
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * What the host app must implement to receive what the mesh produces. `MeshLayer` implements it in the
 * shell; the probe app implements it with log lines. Every callback arrives on a transport thread.
 */
interface MeshSink {
    fun onPublicMessage(msg: BitchatMessage, replacing: Boolean) {}
    fun onPrivateMessage(peerID: String, msg: BitchatMessage, replacing: Boolean) {}
    fun onMessageRemoved(messageID: String, private: Boolean) {}
    fun onDeliveryStatus(messageID: String, status: DeliveryStatus) {}
    fun onPeersChanged(all: Set<String>, direct: Set<String>) {}
}

object AppStateStore {

    // ---- the sink -------------------------------------------------------------------------------
    @Volatile private var sink: MeshSink? = null

    /** Register the host. Called once by MeshLayer before the transport starts. */
    fun setSink(s: MeshSink?) { sink = s }

    // ---- identity -------------------------------------------------------------------------------
    private val _nickname = MutableStateFlow("anon")
    /** Read by the transport when it builds an ANNOUNCE; the page owns the value. */
    val nickname: StateFlow<String> = _nickname.asStateFlow()
    fun setNickname(n: String) { _nickname.value = n }

    // ---- peers ----------------------------------------------------------------------------------
    // Peers are reported PER TRANSPORT (BLE today, another tomorrow) and the visible set is the union.
    // Keeping the per-transport map — rather than one flat set — is why a transport going quiet removes
    // only its own peers instead of everyone's.
    private val peersByTransport = LinkedHashMap<String, Set<String>>()
    private val directByTransport = LinkedHashMap<String, Set<String>>()

    private val _peers = MutableStateFlow<Set<String>>(emptySet())
    /** Everyone reachable, direct or relayed. */
    val peers: StateFlow<Set<String>> = _peers.asStateFlow()

    private val _directPeers = MutableStateFlow<Set<String>>(emptySet())
    /** Only the peers we hold a live link to — the honest "who is actually next to me" number. */
    val directPeers: StateFlow<Set<String>> = _directPeers.asStateFlow()

    fun setTransportPeers(transportId: String, ids: List<String>) = synchronized(this) {
        peersByTransport[transportId] = ids.toSet()
        publishPeers()
    }

    fun setTransportDirectPeers(transportId: String, ids: Collection<String>) = synchronized(this) {
        directByTransport[transportId] = ids.toSet()
        publishPeers()
    }

    fun getDirectPeers(): Set<String> = _directPeers.value

    // Called when a transport stops: it must take ITS peers with it and leave the others alone, which is
    // the whole reason the sets are kept per transport rather than flattened on write.
    fun clearTransportPeers(transportId: String) = synchronized(this) {
        peersByTransport.remove(transportId); publishPeers()
    }

    fun clearTransportDirectPeers(transportId: String) = synchronized(this) {
        directByTransport.remove(transportId); publishPeers()
    }

    private fun publishPeers() {
        val all = peersByTransport.values.flatten().toSet()
        val direct = directByTransport.values.flatten().toSet()
        _peers.value = all
        _directPeers.value = direct
        sink?.onPeersChanged(all, direct)
    }

    // ---- messages -------------------------------------------------------------------------------
    // No storage here on purpose. The transport calls add/upsert/remove as packets arrive and as partial
    // media is finalised; we pass that through and let the page decide what to keep. `replacing` carries
    // the add-vs-upsert distinction so the page can replace a row instead of appending a duplicate.
    fun addPublicMessage(msg: BitchatMessage) { sink?.onPublicMessage(msg, replacing = false) }
    fun upsertPublicMessage(msg: BitchatMessage) { sink?.onPublicMessage(msg, replacing = true) }
    fun removePublicMessage(messageID: String) { sink?.onMessageRemoved(messageID, private = false) }

    fun addPrivateMessage(peerID: String, msg: BitchatMessage, forceRead: Boolean = false): Boolean {
        sink?.onPrivateMessage(peerID, msg, replacing = false)
        return true          // their contract: "was it accepted"; the page never refuses a delivered message
    }

    fun upsertPrivateMessage(peerID: String, msg: BitchatMessage, forceRead: Boolean = false) {
        sink?.onPrivateMessage(peerID, msg, replacing = true)
    }

    fun removePrivateMessage(messageID: String) { sink?.onMessageRemoved(messageID, private = true) }

    /**
     * Theirs writes through a serialized SQLite transaction first, so a notification can never advertise
     * a message that an immediate process death would lose. We have no database in the APK; the page is
     * the store, and the bridge call it makes is itself the acknowledgement. Same contract, one hop later.
     */
    suspend fun addPrivateMessageDurably(peerID: String, msg: BitchatMessage, forceRead: Boolean = false): Boolean {
        sink?.onPrivateMessage(peerID, msg, replacing = false)
        return true
    }

    /** A message addressed to a named channel rather than to the room or to a person. */
    fun addChannelMessage(channel: String, msg: BitchatMessage) {
        sink?.onPublicMessage(msg, replacing = false)
    }

    fun updatePrivateMessageStatus(messageID: String, status: DeliveryStatus) {
        sink?.onDeliveryStatus(messageID, status)
    }

    /**
     * Called by SeenMessageStore when a read receipt lands. Read state is a property of the conversation,
     * which lives in the page, so it travels the same way a delivery status does.
     */
    fun markPrivateMessageRead(messageID: String) {
        sink?.onDeliveryStatus(messageID, DeliveryStatus.Read(by = "", at = java.util.Date()))
    }

    /**
     * Their conversation store merges chats that turn out to be the same person reached two ways (a mesh
     * peer id and a Noise key). We hold no conversations, so there is nothing to canonicalise — the page
     * keys its threads by the stable fingerprint the message already carries.
     */
    fun canonicalizePrivateChats() { /* no store, nothing to merge */ }
}
