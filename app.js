// add Dependencies
const fs = require("fs");
const nfzf = require("node-fzf");
const readline = require("readline");
const ytdl = require("ytdl-core");
const ytSearch = require("yt-search");
const converter = require("video-converter");
const ffmetadata = require("ffmetadata");
const CliProgress = require("cli-progress");
const albumart = require("album-art");
const imagedownload = require("image-downloader");

// init function
function init() {
  // clear console
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "Down>"
  });

  console.clear();

  // create required directories
  if (!fs.existsSync("cache")) fs.mkdirSync("cache");

  if (!fs.existsSync("completed")) fs.mkdirSync("completed");

  rl.question("What are you looking for? ", name => {
    rl.close();
    search(name);
  });
}

// search function
function search(name) {
  ytSearch({ query: name, pageStart: 1, pageEnd: 5 }, (err, response) => {
    if (err) throw err;

    var list = [];
    var videos = response.videos;

    // add "videos" to "list"
    for (var i = 0; i < videos.length; i++) {
      const song = videos[i];
      const title = song.title; // extract title
      const text =
        "Channel: " +
        song.author.name +
        "\n" +
        "Title: " +
        title +
        "(%t)".replace("%t", song.timestamp); // format {channel} || {video_title} ({timestamp})
      list.push(text); // push video to list
    }

    nfzf(list, res => {
      if (!res.selected) console.log("No Song Found");

      const id = videos[res.selected.index].videoId; // video id
      const title = videos[res.selected.index].title;

      // get info
      getInfo(id, title);
    });
  });
}

// getinfo function
function getInfo(id, name) {
  ytdl.getInfo(id, (err, info) => {
    if (err) throw err;

    // begin download
    download(info.video_url, info);
  });
}

// download function
function download(url, info) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "Down>"
  });

  console.clear();

  ytdl(url, {
    filter: format => format.container === "mp4",
    quality: "highestaudio"
  })
    .on("response", res => {
      var total = res.headers["content-length"];
      var read = 0;

      // display
      console.log("Downloading " + info.title);

      // configure progress bar
      const bar = new CliProgress.SingleBar(
        {
          hideCursor: true,
          fps: 120,
          forceRedraw: true,
          format: "[{bar}]"
        },
        CliProgress.Presets.rect
      );

      bar.start(total); // start progress bar

      res.on("data", data => {
        read += data.length;
        bar.update(read); // update progress bar
      });

      res.on("end", () => {
        bar.stop(); // stop progress bar
      });
    })
    .pipe(fs.createWriteStream("cache/" + info.title + ".mp4")) // write stream to cache
    .on("close", () => {
      console.log("Finishing up.");

      // convert mp4 to mp3
      converter.convert(
        "cache/" + info.title + ".mp4",
        "completed/" + info.title + ".mp3",
        err => {
          if (err) throw err;

          // delete mp4 from cache
          fs.unlinkSync("cache/" + info.title + ".mp4");

          var data = { title: "", album: "", artist: " " };

          rl.question(
            "Please enter the title, album name and artist name seperated by a comma. Eg. {song, album, artist} ",
            value => {
              rl.close();

              // extract and clean up data
              var v = value
                .replace("{", "")
                .replace("}", "")
                .split(",");
              data.title = v[0].trim();
              data.album = v[1].trim();
              data.artist = v[2].trim();

              // fetch album art if exists
              const art_url = albumart(data.artist.toString(), {
                album: data.album.toString(),
                size: "extreme"
              });

              art_url.then(res => {
                if (res.toString().startsWith("http")) {
                  // download remote image
                  imagedownload
                    .image({
                      url: res.replace("300x300", "1080x1080"),
                      dest: "cache"
                    })
                    .then(({ filename, image }) => {
                      // write song info to mp3
                      ffmetadata.write(
                        "completed/" + info.title + ".mp3",
                        {
                          artist: data.artist.toString(),
                          title: data.title.toString(),
                          album: data.album.toString()
                        },
                        {
                          attachments: [filename]
                        },
                        function(err) {
                          if (err) {
                            console.error("Error writing metadata", err);
                          } else {
                            console.log("Download complete.");
                            fs.unlinkSync(filename);
                          }
                        }
                      );
                    })
                    .catch(err => console.log(err));
                } else {
                  ffmetadata.write(
                    "completed/" + info.title + ".mp3",
                    {
                      artist: data.artist.toString(),
                      title: data.title.toString(),
                      album: data.album.toString()
                    },
                    {
                      attachments: ["cover.jpg"]
                    },
                    function(err) {
                      if (err) {
                        console.error("Error writing metadata", err);
                      } else {
                        console.log("Download complete.");
                      }
                    }
                  );
                }
              });
            }
          );
        }
      );
    });
}

init();
