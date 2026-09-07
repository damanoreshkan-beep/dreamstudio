package com.bitchat.android.ui

// OUR CODE, in THEIR package. A notification is a host concern, not a transport one: in the shell it is
// the APK's business (a channel, an icon, a tap target that opens our page), and the page decides what
// deserves one. So the transport keeps calling, and this forwards the fact upward instead of drawing a
// notification bitchat's way — the shell's own notification action will consume it later.

import android.content.Context
import android.util.Log
import com.bitchat.android.model.BitchatMessage
import com.bitchat.android.services.AppStateStore

class NotificationManager(
    private val context: Context,
    private val compat: androidx.core.app.NotificationManagerCompat
) {
    /** The transport tells the host when the app went to the background; the shell needs this later. */
    fun setAppBackgroundState(background: Boolean) {
        Log.v(TAG, "app background=$background")
    }

    /**
     * A private message arrived while nothing was on screen. We do not raise bitchat's notification: the
     * message has already travelled to the page through AppStateStore, and the shell will decide whether
     * to notify once the bridge action exists.
     */
    fun showPrivateMessageNotification(senderPeerID: String, senderNickname: String, preview: String) {
        Log.v(TAG, "dm from $senderNickname ($senderPeerID): ${preview.take(40)}")
    }

    private companion object { const val TAG = "MESHNODE" }
}

/** The one-line preview a notification would show. Theirs formats media rows; ours takes the text. */
object NotificationTextUtils {
    @JvmStatic
    fun buildPrivateMessagePreview(message: BitchatMessage): String = message.content
}
