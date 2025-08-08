package com.dtd.serverShell.proxy;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

public class VlcSessionManager {
	private static volatile String activeSessionId;
    // The actual session storage
    private static final Map<String, VlcSession> sessionMap = new ConcurrentHashMap<>();
    // Internal data structure to hold port mappings per session
    public static class VlcSession {
        private final int websockifyPort;
        private final int httpVlcPort;
        private final int vncPort;

        
        public VlcSession(int websockifyPort, int httpVlcPort, int vncPort) {
            this.websockifyPort = websockifyPort;
            this.httpVlcPort = httpVlcPort;
            this.vncPort = vncPort;
        }

        public int getWebsockifyPort() { return websockifyPort; }
        public int getHttpVlcPort() { return httpVlcPort; }
        public int getVncPort() { return vncPort; }
    }

    // Create and store a new session, return session ID
    public static String registerSession(int websockifyPort, int httpVlcPort, int vncPort) {
        String sessionId = UUID.randomUUID().toString();
        sessionMap.put(sessionId, new VlcSession(websockifyPort, httpVlcPort, vncPort));
        activeSessionId = sessionId;
        return sessionId;
    }

    public static VlcSession getSession(String sessionId) {
        return sessionMap.get(sessionId);
    }

    public static void removeSession(String sessionId) {
        sessionMap.remove(sessionId);
    }

    // Optional: to check if session exists
    public static boolean hasSession(String sessionId) {
        return sessionMap.containsKey(sessionId);
    }
    
	public static int getWebsockifyPort(String sessionId) {
	    VlcSession session = getSession(sessionId);
	    if (session == null) throw new IllegalArgumentException("Invalid session ID: " + sessionId);
	    return session.getWebsockifyPort();
	}
	
	public static VlcSession getActiveSession() {
	    return activeSessionId != null ? sessionMap.get(activeSessionId) : null;
	}
}
