package com.dtd.fileServer.controller;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class LoginController {
    @GetMapping("/login")
    public String login() {
        return "login";  // returns login.html template from src/main/resources/templates/
    }
}
