package com.dtd.serverShell.logging;

import com.dtd.serverShell.logging.ssLogger;

public final class serverShellLoggerFactory {

    private serverShellLoggerFactory() {}

    // FULL only
    public static ssLogger getServerLogger(String fullLoggerName) {
        final String debug = derivedDebugName(fullLoggerName);
        preflight(fullLoggerName, debug, false);
        return new ssLogger(fullLoggerName, debug, false);
    }

    // FULL + optional DEBUG mirror
    public static ssLogger getServerLogger(String fullLoggerName, boolean alsoDebug) {
        final String debug = derivedDebugName(fullLoggerName);
        preflight(fullLoggerName, debug, alsoDebug);
        return new ssLogger(fullLoggerName, debug, alsoDebug);
    }

    // FULL + explicit DEBUG logger name
    public static ssLogger getServerLogger(String fullLoggerName, String debugLoggerName, boolean alsoDebug) {
        preflight(fullLoggerName, debugLoggerName, alsoDebug);
        return new ssLogger(fullLoggerName, debugLoggerName, alsoDebug);
    }

    // Replace "-full" with "-debug"; otherwise append "-debug".
    private static String derivedDebugName(String fullName) {
        if (fullName == null || fullName.isBlank()) return "serverShell-debug";
        int ix = fullName.lastIndexOf("-full");
        if (ix >= 0) return fullName.substring(0, ix) + "-debug" + fullName.substring(ix + 5);
        return fullName + "-debug";
    }

    // Guard bad inputs
    private static void preflight(String full, String debug, boolean alsoDebug) {
        if (full == null || full.isBlank()) {
            throw new IllegalArgumentException("fullLoggerName must not be null/blank");
        }
        if (alsoDebug) {
            if (debug == null || debug.isBlank()) {
                throw new IllegalArgumentException("debugLoggerName must not be null/blank when alsoDebug=true");
            }
            if (full.equals(debug)) {
                throw new IllegalArgumentException("debugLoggerName must differ from fullLoggerName");
            }
        }
    }
}