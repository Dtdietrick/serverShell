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
        return http
            .csrf(csrf -> csrf.disable())
            .headers(headers -> headers.frameOptions(frame -> frame.sameOrigin()))
            .authorizeHttpRequests(auth -> auth
            	    .requestMatchers(
            	    	"/emulator/**", 
            	        "/roms/**",
            	        "/saves/**",       
            	        "/login", "/logout",
            	        "/css/**", "/js/**",
            	        "/epubReader.html",
            	        "/user/role"
            	    ).permitAll()
            	    .requestMatchers("/admin/**").hasRole("ADMIN")
            	    .requestMatchers("/user/**").authenticated()
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
            )
            .build();
    }
}