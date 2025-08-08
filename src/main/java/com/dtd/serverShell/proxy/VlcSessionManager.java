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
        private final int httpVlcPort;
       
        public VlcSession(int httpVlcPort) {
            this.httpVlcPort = httpVlcPort;
        }
        
        public int getHttpVlcPort() { return httpVlcPort; }
    }

    // Create and store a new session, return session ID
    public static String registerSession( int httpVlcPort) {
        String sessionId = UUID.randomUUID().toString();
        sessionMap.put(sessionId, new VlcSession(httpVlcPort));
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
    
    public static int getHttpVlcPort(String sessionId) {
        VlcSession session = sessionMap.get(sessionId);
        return (session != null) ? session.getHttpVlcPort() : -1;
    }
    
	public static VlcSession getActiveSession() {
	    return activeSessionId != null ? sessionMap.get(activeSessionId) : null;
	}
}
