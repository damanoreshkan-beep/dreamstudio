package ms.meshprobe;

// No UI on purpose. The Activity exists only because an app needs a launcher entry for `monkey` to start
// it; everything worth seeing goes to logcat under MESHPROBE.

import android.app.Activity;
import android.os.Bundle;
import android.util.Log;
import android.widget.TextView;

public class MainActivity extends Activity {
    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        TextView tv = new TextView(this);
        tv.setText("meshprobe — see: adb logcat -s MESHPROBE:V");
        setContentView(tv);
        Log.i(MeshProbe.TAG, "=== meshprobe boot ===");
        // Permissions are granted at install time with `adb install -g`; asking again would need a UI flow
        // and this app deliberately has none. If a permission is missing the calls below log the denial.
        new MeshProbe(this).start();
    }
}
