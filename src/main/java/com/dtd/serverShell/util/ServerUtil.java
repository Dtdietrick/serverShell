package com.dtd.serverShell.util;

import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;

import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

@Configuration
public class ServerUtil {
    private static Environment environment;

    public ServerUtil(Environment env) {
        environment = env;
    }

    public static String getServerHost() {
        return "prod".equalsIgnoreCase(environment.getProperty("spring.profiles.active"))
            ? getHostOrDefault()
            : "localhost";
    }

    private static String getHostOrDefault() {
        try {
            return InetAddress.getLocalHost().getHostAddress();
        } catch (Exception e) {
            e.printStackTrace();
            return "localhost";
        }
    }
    
    public static int findFreePortInRange(int minPort, int maxPort) {
        for (int port = minPort; port <= maxPort; port++) {
            try (ServerSocket socket = new ServerSocket()) {
                socket.setReuseAddress(true);
                socket.bind(new InetSocketAddress("0.0.0.0", port));
                return port;
            } catch (IOException ignored) {
                // Port is in use, try next
            }
        }
        throw new IllegalStateException("No available port in range " + minPort + "-" + maxPort);
    }
    
    public static boolean waitForPort(String host, int port, int timeoutMs) {
        long start = System.currentTimeMillis();
        while (System.currentTimeMillis() - start < timeoutMs) {
            try (Socket socket = new Socket()) {
                socket.connect(new InetSocketAddress(host, port), 500);
                return true;
            } catch (IOException ignored) {
                try {
                    Thread.sleep(200); // short wait before retry
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    return false;
                }
            }
        }
        return false;
    }
}
