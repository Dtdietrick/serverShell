The setup for a new server can be done with very little outside software setup and minimal code changes.

- use the app

- The server operates under some basic assumptions:
  2 variables need to be set:
    1) in the file /src/main/resources/application.properties
      spring.data.mongodb.uri=${MONGO_URI}
      this is a the mongoDB for the server (see MONGO.md for further instructions)
    2)  in the file /src/main/resources/application-prod.properties
      media.dir=/srv/
      this is the directory your media files live in
 - For the media directories there are some basic assumtions made:
    1) You split the media into 3 sub-directories Movies,TV,Music
        right now the UI always assumes you have all 3, you do not need them, but the buttons will show up regardless, just will appear empty
    2)Any media is encoded properly to include .m4s segemnts, an index.m3u8, and an init.mp4 (encoding scripts for windows/linux can be shared upon request)
 - To use the emulators 2 steps are required
    1) build the Docker image found here (docker is very simple, figure it out yourself)
    https://github.com/Dtdietrick/retroArchContainer/tree/prod-stable
    2) in the file /src/main/resources/application-prod.properties
    retroarch.image=retro-prod
    this must match the name you gave your docker image, as long as this image is active, you should be good to use the emulator

!!!NOTE!!!
Always update application-prod.properties not application-local.properties, the local is for more advanced users who want to test code changes of their own.


    
