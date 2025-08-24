package com.dtd.serverShell.config;

import com.dtd.serverShell.security.CustomLoginSuccessHandler;
import com.dtd.serverShell.security.CustomUserDetailsService;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.*;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.crypto.password.PasswordEncoder;
import passwordHasher.passwordHasher;

@Configuration
public class SecurityConfig {


@Bean
public PasswordEncoder passwordEncoder() {
    return new PasswordEncoder() {
        @Override
        public String encode(CharSequence rawPassword) {
            return passwordHasher.hash(rawPassword.toString());
        }

        @Override
        public boolean matches(CharSequence rawPassword, String encodedPassword) {
            return passwordHasher.matches(rawPassword.toString(), encodedPassword);
        }
    };
}
    @Autowired
    private CustomLoginSuccessHandler customLoginSuccessHandler;
    
    private final CustomUserDetailsService userDetailsService;

    public SecurityConfig(CustomUserDetailsService userDetailsService) {
        this.userDetailsService = userDetailsService;
    }
    
    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
        .csrf(csrf -> csrf.disable())
        .headers(headers -> headers.frameOptions(frame -> frame.sameOrigin()))
        .authorizeHttpRequests(auth -> auth
            // HLS files must be public so the player can GET them
            .requestMatchers("/streams/**").permitAll()

            // PUBLIC STATIC ASSETS (ES modules, CSS, fonts, images, helper JS)
            .requestMatchers(
                "/css/**",
                "/fonts/**",
                "/media/**",  
                "/ui/**",        
                "/explorer/**",
                "/emulator/**",
                "/util/**",
                "/images/**",
                //extensions anywhere under static
                "/*.css","/*.js","/*.mjs","/*.map","/*.png","/*.svg","/*.jpg","/*.ico"
            ).permitAll()

            // Auth pages / small APIs used pre-login
            .requestMatchers("/login", "/user/role").permitAll()

            // VIDEO control endpoints (start/stop) must be authenticated
            .requestMatchers("/media/hls", "/media/hls/**").authenticated()

            // Emulator app + protected pages
            .requestMatchers("/emulator/**", "/roms/**", "/save/**").authenticated()
            .requestMatchers("/epub/download", "/epubReader.html").authenticated()
            .requestMatchers("/admin/**").hasRole("ADMIN")
            .requestMatchers("/user/**").authenticated()

            // Everything else = auth
            .anyRequest().authenticated()
        )
        .formLogin(form -> form
            .loginPage("/login")
            .loginProcessingUrl("/login")
            .successHandler(customLoginSuccessHandler)
            .failureUrl("/login?error")
            .permitAll()
        )
        .logout(logout -> logout
            .logoutUrl("/logout")
            .logoutSuccessUrl("/login?logout")
            .invalidateHttpSession(true)
            .deleteCookies("JSESSIONID")
        );
        
        return http.build();
    }
}