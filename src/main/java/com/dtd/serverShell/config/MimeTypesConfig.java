package com.dtd.serverShell.config;

import org.springframework.boot.web.server.MimeMappings;
import org.springframework.boot.web.server.WebServerFactoryCustomizer;
import org.springframework.boot.web.servlet.server.ConfigurableServletWebServerFactory;
import org.springframework.context.annotation.Configuration;

@Configuration
public class MimeTypesConfig implements WebServerFactoryCustomizer<ConfigurableServletWebServerFactory> {
 @Override
 public void customize(ConfigurableServletWebServerFactory factory) {
     MimeMappings mappings = new MimeMappings(MimeMappings.DEFAULT);
     mappings.add("js",   "application/javascript");
     mappings.add("mjs",  "text/javascript");
     mappings.add("map",  "application/json");

     mappings.add("m3u8", "application/vnd.apple.mpegurl");
     mappings.add("ts",   "video/mp2t");
     mappings.add("vtt",  "text/vtt");

     mappings.add("woff",  "font/woff");
     mappings.add("woff2", "font/woff2");
     mappings.add("ttf",   "font/ttf");
     mappings.add("otf",   "font/otf");
     mappings.add("svg",   "image/svg+xml");
     mappings.add("png",   "image/png");
     mappings.add("jpg",   "image/jpeg");
     mappings.add("jpeg",  "image/jpeg");
     mappings.add("ico",   "image/x-icon");
     factory.setMimeMappings(mappings);
 }
}
