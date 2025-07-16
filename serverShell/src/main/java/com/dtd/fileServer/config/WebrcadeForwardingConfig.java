package com.dtd.serverShell.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ViewControllerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebrcadeForwardingConfig implements WebMvcConfigurer {
    @Override
    public void addViewControllers(ViewControllerRegistry registry) {
        registry.addViewController("/webrcade/play/app/gba")
                .setViewName("forward:/webrcade/play/app/gba/index.html");

        registry.addViewController("/webrcade/play/app/gba/")
                .setViewName("forward:/webrcade/play/app/gba/index.html");
    }
}