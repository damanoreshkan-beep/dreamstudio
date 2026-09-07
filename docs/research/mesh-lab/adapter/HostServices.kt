package com.bitchat.android.services

// OUR CODE, in THEIR package — the host-application services the BLE orchestrator asks for.
// None of this is protocol. Each one is a question the transport asks its host, and our host is the web
// page behind the bridge, so the answers are short.

import android.content.Context

/**
 * The nickname that goes into every ANNOUNCE. Theirs reads a DataManager backed by the app's
 * preferences; ours reads the value the page set through the bridge, and falls back to the peer id
 * exactly as theirs does when nothing is set.
 */
object NicknameProvider {
    fun getNickname(context: Context, myPeerID: String): String {
        val n = AppStateStore.nickname.value
        return if (n.isBlank() || n == "anon") myPeerID else n
    }
}

/**
 * Theirs routes a message between the mesh and the OTHER transports — Nostr, geohash channels — and the
 * BLE orchestrator asks for it only to decide whether a distant peer can be reached another way.
 * We ship one transport, so there is no second route and the honest answer is "no router". The call site
 * is `runCatching { ... }.getOrNull()`, so null is a value it already handles.
 */
object MessageRouter {
    @JvmStatic
    fun tryGetInstance(): MessageRouter? = null

    // Never reached — tryGetInstance is always null — but the members must exist for the orchestrator's
    // call sites to type-check. They are the two things it would ask a router to do.
    fun onSessionEstablished(peerID: String) {}
    fun sendReadReceipt(receipt: com.bitchat.android.model.ReadReceipt, recipientPeerID: String) {}
}
