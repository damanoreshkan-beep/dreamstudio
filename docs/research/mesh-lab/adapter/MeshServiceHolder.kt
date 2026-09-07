package com.bitchat.android.service

// OUR CODE, in THEIR package — and deliberately the SAME code where it matters.
//
// Theirs is a singleton with two jobs: hold the app's mesh service objects (BluetoothMeshService,
// UnifiedMeshService — the app layer we do not ship), and coordinate ONE gossip-sync manager shared by
// several transports. Only the second job is transport work, so only the second job is here, and its
// body is copied rather than re-imagined: the delegate wiring, the owner counting and the
// stop-the-previous-manager guard are theirs, because a gossip manager that keeps running after its last
// owner leaves is a radio nobody asked for, and that bug is easy to write from scratch.

import com.bitchat.android.model.RoutedPacket
import com.bitchat.android.protocol.BitchatPacket
import com.bitchat.android.sync.GossipSyncManager

object MeshServiceHolder {

    @Volatile private var sharedGossipSyncManager: GossipSyncManager? = null
    private val activeGossipOwners = mutableSetOf<String>()

    @Synchronized
    fun setGossipManager(mgr: GossipSyncManager, signer: (BitchatPacket) -> BitchatPacket) {
        val previous = sharedGossipSyncManager
        if (previous !== mgr) {
            try { previous?.stop() } catch (_: Exception) { }
        }
        sharedGossipSyncManager = mgr
        mgr.delegate = TransportGossipDelegate(signer)
        if (activeGossipOwners.isNotEmpty()) mgr.start()
    }

    @Synchronized
    fun startSharedGossip(owner: String) {
        val wasIdle = activeGossipOwners.isEmpty()
        activeGossipOwners.add(owner)
        if (wasIdle) sharedGossipSyncManager?.start()
    }

    @Synchronized
    fun stopSharedGossip(owner: String) {
        activeGossipOwners.remove(owner)
        if (activeGossipOwners.isEmpty()) sharedGossipSyncManager?.stop()
    }

    /** Theirs, unchanged: the manager sends through the transport bridge and signs with the owner's key. */
    private class TransportGossipDelegate(
        private val signer: (BitchatPacket) -> BitchatPacket
    ) : GossipSyncManager.Delegate {
        override fun sendPacket(packet: BitchatPacket) {
            TransportBridgeService.broadcastFromLocal(RoutedPacket(packet))
        }

        override fun sendPacketToPeer(peerID: String, packet: BitchatPacket) {
            TransportBridgeService.sendToPeerFromLocal(peerID, packet)
        }

        override fun signPacketForBroadcast(packet: BitchatPacket): BitchatPacket = signer(packet)
    }
}
