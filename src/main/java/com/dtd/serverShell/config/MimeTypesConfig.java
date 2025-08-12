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
     mappings.add("m3u8", "application/vnd.apple.mpegurl");
     mappings.add("ts",   "video/mp2t");
     factory.setMimeMappings(mappings);
 }
}
