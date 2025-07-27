package com.dtd.serverShell.config;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.HashMap;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.dtd.serverShell.controller.EmulatorController;

public class RomRegistry {
    private static final Map<String, String> romToCore = new HashMap<>();
    private final static Logger logger = LoggerFactory.getLogger(RomRegistry.class);
    static {
        // Add ROMs and the core they should use
        romToCore.put("Pokemon-Emerald.gba", "mGBA");
        romToCore.put("Pokemon-Red.gb", "mGBA");
    }

    public static boolean isAllowed(String rom) {
        return romToCore.containsKey(rom);
    }

    public static String getCoreType(String rom) {
        return romToCore.get(rom);
    }

    public static Map<String, String> getAllRoms() {
        return romToCore;
    }
    
    public static void initializeUserRetroarchIfMissing(String username, String romSaveDir) throws IOException {
        Path userRoot = Paths.get(romSaveDir, "users", username);
        Path configPath = userRoot.resolve("config");
        Path savesPath = userRoot.resolve("saves");

        boolean needsInit = !Files.exists(configPath) || !Files.exists(savesPath);

        if (needsInit) {
            logger.info("🧪 Initializing config/saves for new user '{}'", username);

            // Copy default template files
            Path defaultRoot = Paths.get(romSaveDir, "default");
            Path defaultConfig = defaultRoot.resolve("config");
            Path defaultSaves  = defaultRoot.resolve("saves");

            //config walk
            Files.walk(defaultConfig).forEach(source -> {
                try {
                    Path relative = defaultConfig.relativize(source);
                    Path destination = configPath.resolve(relative);
                    if (Files.isDirectory(source)) {
                        Files.createDirectories(destination);
                    } else {
                        Files.createDirectories(destination.getParent());
                        Files.copy(source, destination, StandardCopyOption.REPLACE_EXISTING);
                    }
                } catch (IOException e) {
                    logger.error("❌ Failed to copy default config file '{}'", source, e);
                }
            });

            //save walk
            Files.walk(defaultSaves).forEach(source -> {
                try {
                    Path relative = defaultSaves.relativize(source);
                    Path destination = savesPath.resolve(relative);
                    if (Files.isDirectory(source)) {
                        Files.createDirectories(destination);
                    } else {
                        Files.createDirectories(destination.getParent());
                        Files.copy(source, destination, StandardCopyOption.REPLACE_EXISTING);
                    }
                } catch (IOException e) {
                    logger.error("❌ Failed to copy default save file '{}'", source, e);
                }
            });
            logger.info(" Default config/saves initialized for user '{}'", username);
        }
    }
}
