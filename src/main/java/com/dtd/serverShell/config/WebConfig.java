package com.dtd.serverShell.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.CacheControl;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

// Map /streams/** to the on-disk folder, disable caching to avoid stale m3u8

@Configuration
public class WebConfig implements WebMvcConfigurer {
    
  @Value("${streams.dir}") String streamsDir;
  
  @Override
  public void addResourceHandlers(ResourceHandlerRegistry registry) {
   
        String root = streamsDir.endsWith("/") ? streamsDir : streamsDir + "/";
        registry.addResourceHandler("/streams/**")
                .addResourceLocations("file:" + root)
                .setCacheControl(CacheControl.noStore())
                .resourceChain(true);
      }
}
