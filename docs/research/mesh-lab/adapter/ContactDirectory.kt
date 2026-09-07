package com.bitchat.android.services

// OUR CODE, in THEIR package — the third and smallest seam.
//
// bitchat's ContactDirectory is their contact book: 228 lines that reach favorites, identity, mesh, model
// AND nostr, and behind nostr the geohash alias registry and the conversation ordering table. The kept
// transport touches ONE function of it, at MessageHandler:663, to decide which conversation a system
// notice belongs to.
//
// We hold no contact book in the APK — the page does — and our threads are keyed by the peer id that the
// message already carries. So the canonical id of a conversation with a peer IS that peer's id, and this
// file says exactly that and nothing more. If the page ever merges two ids into one person, it merges
// them; that is a product decision about display, not a transport concern.

object ContactDirectory {
    /**
     * Their contract: given a peer id or a conversation id, return the stable id to file a message under.
     * Ours is the identity function with the whitespace/case normalisation theirs also applies, so two
     * spellings of the same peer never open two threads.
     */
    fun canonicalConversationId(peerOrConversationID: String): String =
        peerOrConversationID.trim().lowercase()
}
