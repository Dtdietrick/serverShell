package com.dtd.serverShell;

import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import com.dtd.serverShell.model.AppUser;
import com.dtd.serverShell.repository.AppUserRepository;

@SpringBootApplication
public class LocalserverShellApplication {

	public static void main(String[] args) {
		SpringApplication.run(LocalserverShellApplication.class, args);
	}

	/*
	 * @Bean public CommandLineRunner init(AppUserRepository repo,
	 * BCryptPasswordEncoder encoder) { return args -> { if
	 * (repo.findByUsername("admin").isEmpty()) { String hashedPassword =
	 * encoder.encode("secret"); AppUser user = new AppUser("admin", hashedPassword,
	 * "ROLE_USER"); repo.save(user); } }; }
	 */
//	@Bean
//	public CommandLineRunner init(AppUserRepository repo, BCryptPasswordEncoder encoder) {
//	    return args -> {
//	    	//TODO: Remove this before prod deploy, will wipe user data
//	        repo.deleteAll(); // optional, to remove bad data. 
//
//	        if (repo.findByUsername("admin").isEmpty()) {
//	            String hashedPassword = encoder.encode("secret");
//	            AppUser user = new AppUser("admin", hashedPassword, "ROLE_USER");
//	            repo.save(user);
//	            System.out.println("Created user with hashed password: " + hashedPassword);
//	        }
//	    };
//	}
}
