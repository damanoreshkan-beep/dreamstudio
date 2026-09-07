package com.bitchat.android.nostr

// OUR CODE, in THEIR package. bitchat's geohash channels give a peer a second identity per location
// room, and this registry maps those aliases back to people. We ship no geohash channels — our public
// room is the mesh itself — so the map is empty and every alias lookup misses, which is exactly what the
// orchestrator expects when a peer has never been seen in a geohash room.

object GeohashAliasRegistry {
    @JvmStatic
    fun snapshot(): Map<String, String> = emptyMap()
}
