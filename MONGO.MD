Setup your own free mongoDB here: https://www.mongodb.com
The server uses a very basic collection, in this example a dynamic variable is in braces like this <VARIABLE>

{"_id":{"$oid":"<MONGODB_ID>"},
"username":"<USERNAME>",
"password":"<HASHED_PASSWORD>",
"role":"ROLE_USER",
"recentViews":
["<RECENT_VIEW_1>",
...
"<RECENT_VIEW_10>"
],
"_class":"com.dtd.serverShell.model.AppUser"}

Recent views will automatically populate based on user clicks, holding up to ten media files. Password must be hashed in a compatible way, as plain text password is not known to server.

ROLE_ADMIN should be a restricted role and allows the ADMIN user to add/delete other users from the MONGODB by accessing the "Dashboard" functionality in the UI and therefore controls other users access to the application.
