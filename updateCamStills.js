var request = require('request');
var ffmpeg = require('ffmpeg');
var ffmpegBin = require('ffmpeg-binary-linux-64bit');
var fs = require("fs"); //Load the filesystem module
var fse = require('fs-extra');
var filesize = require('file-size');
var SunCalc = require('suncalc');
var sleep = require('sleep');
require('dotenv').config({path: __dirname+'/.env'});
var psTree = require('ps-tree');
var gm = require('gm');
var imageMagick = gm.subClass({ imageMagick: true });
var ffmpegLoc = ffmpegBin();
var moment = require('moment');
const path = require('path');


function genStills(){

    //var timeNow = new Date();
    var timeNow = moment();
//    var timeNow = moment("2016-07-03 14:20:00");

    var times = SunCalc.getTimes(timeNow, process.env.CAM_LOCATION_LAT, process.env.CAM_LOCATION_LON);
    var timesTomorrow = SunCalc.getTimes(moment(timeNow).add(1,'d'), process.env.CAM_LOCATION_LAT, process.env.CAM_LOCATION_LON);
    var sunriseBegin = moment(times.sunrise).format('YYYY-MM-DD HH:mm:ss');
    var sunriseEnd = moment(times.goldenHourEnd).format('YYYY-MM-DD HH:mm:ss');

    var sunsetBegin = moment(times.goldenHour).format('YYYY-MM-DD HH:mm:ss');
    var sunsetEnd = moment(times.sunset).format('YYYY-MM-DD HH:mm:ss');
    var nightBegin = moment(times.night).add(.5,'h').format('YYYY-MM-DD HH:mm:ss'); /// Give our begin to night a little buffer after sunset
    var nightEnd = moment(timesTomorrow.dawn).format('YYYY-MM-DD HH:mm:ss');

    console.log("____________________________________________________________________________")

    console.log("Now: "+timeNow.format('YYYY-MM-DD HH:mm:ss'));
    console.log("Sunrise Start: "+sunriseBegin,"Sunrise End: "+sunriseEnd);
    console.log("Sunset Start: "+sunsetBegin, "Sunset End: "+sunsetEnd);
    console.log("Night Start: "+nightBegin, "Night End: "+nightEnd);

    var duringDaytime = false;
    duringDaytime = moment(timeNow).isBetween(moment(sunriseBegin), moment(sunsetEnd));
    var duringNighttime = false;
    duringNighttime = moment(timeNow).isBetween(moment(nightBegin), moment(nightEnd));
    var duringSunriseGoldenHour = false;
    duringSunriseGoldenHour = moment(timeNow).isBetween(moment(sunriseBegin), moment(sunriseEnd));
    var duringSunsetGoldenHour = false;
    duringSunsetGoldenHour = moment(timeNow).isBetween(moment(sunsetBegin), moment(sunsetEnd));


    /// If we are not during the daytime stop everything right there
    /// No need to take any stills
    if(!duringDaytime){
        console.log("Nighttime. No stills.")
        return false;
    }


    /// Step up photos from sunrise until goldenHourEnd
    /// Step up photos from goldenHour until sunset

    //console.log(sunriseStr);
    //return false;

    var options = {
      url: process.env.API_URL,
      headers: {
        'Host': process.env.API_HOST,
        'referer': process.env.API_REFERRER
      }
    };

    var onlineCamCount = 0;
    // Phantomjs binary available at /usr/local/lib/node_modules/phantomjs-prebuilt/lib/phantom/bin/phantomjs
    request.get(options, function(error, response, body){

    var cams = JSON.parse(body);
    //console.log(JSON.parse(body));

    console.log("All Cam count: "+cams.length)

    var stillRel, camErrorCount=0, camCount = 0;

    console.log("In sunrise golden hour: ",duringSunriseGoldenHour)
    console.log("In sunset golden hour: ",duringSunsetGoldenHour)
    /// check to see if now is inbetwen sunrise and sunset
    console.log("In daytime: "+duringDaytime);
    /// check to see if now is inbetwen sunrise and sunset
    console.log("In nighttime: "+duringNighttime);

    console.log("____________________________________________________________________________")

    for(var i=0;i<cams.length;i++){
        if(cams[i].online==1){
            onlineCamCount++;
        }
    }


    for(var i=0;i<cams.length;i++){

//	    	if(i%8==0){
//				console.log(moment().format('ss'));
//2			}

        if(cams[i].online==1){
            camCount++;


            let execOptions = {
              timeout: 3000,
              killSignal: 'SIGKILL',
              camID: cams[i].id
            };

            let stillRel=process.env.BASEDIR_STILLS+cams[i].id+"-still.jpg";

            // if there is a current still frame less than 30 minutes old, we can skip this cam

            try {

                let fileCheck = fs.statSync(stillRel);
                let now = moment(timeNow); //todays date
                let end = moment(fileCheck['ctime']); // another date
                let duration = moment.duration(now.diff(end));
                let fileAge = duration.asMinutes();

                if(duringDaytime&&fileAge>=4){
                // If we are during the golden hour in the moring or the evening take stills more frequently
                // During this period if the still is more than 4 minutes old, take a new one
                // When not in this period check if the still is older than 30 minutes. If it is older than 30 minutes take a new still.
                // If the file is greater than 4 minutes old do a secondary check to see if we are in the golden hour(s).

                    console.log(`${camCount}/${onlineCamCount} `+path.basename(stillRel)+" is "+Math.floor(fileAge)+" minutes old");
    //                console.log(!duringSunriseGoldenHour,!duringSunsetGoldenHour,fileAge);

                    if((duringSunriseGoldenHour||duringSunsetGoldenHour)&&fileAge>=4){
                        console.log(`EXPIRED DURING GH: GEN STILL for ${cams[i].id}`);
                    }else{
                        if((!duringSunriseGoldenHour&&!duringSunsetGoldenHour)&&fileAge>=30){
                            console.log(`EXPIRED: GEN STILL for ${cams[i].id}`);

                            }else{
                        /// We don't need to create a new still because this one is new.
                        continue;
                        }
                    }

                    }else{
                        /// We don't need to create a new still because this one is new.
                        console.log(path.basename(stillRel)+" is "+Math.floor(fileAge)+" minutes old");
                        continue;
                    }

            }
            catch(e) {
                console.log(`MISSING: GEN STILL for ${cams[i].id}`);
            }

            // We are going to generate a new still. Move the existing one to the archive first....

            let dir = process.env.BASEDIR_STILLS_ARCHIVE+cams[i].id;

            if (!fs.existsSync(dir)){
                fs.mkdirSync(dir);
            }


            sleep.usleep(750000);

            /// Let's generate a still frame for this cam
            console.log("GENNING: "+cams[i].id);
            const spawn = require('child_process').spawn;
            const ffm = spawn(ffmpegBin(),['-i', process.env.RTMP_SERVER_URL+cams[i].id+'.stream', '-ss', '00:00:01.500','-y' ,'-vframes', '1', '-f', 'image2', stillRel], execOptions);
//            console.log(spawn);

    //        ffm.stdout.on('data', (data) => {
    //          console.log(`stdout: ${data}`);
    //        });
            /// Ensure that no still takes more than 15 seconds
            setTimeout(function(){
	            console.log('kill '+ffm.pid);
				kill(ffm.pid);
			}, 15000);

            ffm.on('error', (err) => {
              console.log(`error: ${err}`);
            });

            ffm.on('close', (code) => {

                try {
                        let stats = fs.statSync(stillRel);
                        let fileSizeInBytes = filesize(stats["size"]).human('si');

                        console.log(`SUCCESS: ${ffm.pid} ${execOptions.camID} (${fileSizeInBytes}) `);
                        // Copy the file to the archive
                          // 14thstreetpierbob-still_2016-03-14_19-16

                        try {
							// enhance recompress image
							imageMagick(process.env.BASEDIR_STILLS+execOptions.camID+'-still.jpg')
							.enhance()
							.autoOrient()
							.quality(60)
							.write(process.env.BASEDIR_STILLS+execOptions.camID+'-still.jpg', function (err) {
								// if the recomprsssion went well then copy this image and resize it
								if (!err){
									let stats = fs.statSync(this.outname);
									let fileSizeInBytes = filesize(stats["size"]).human('si');

									fse.copySync(this.outname, process.env.BASEDIR_STILLS_ARCHIVE+execOptions.camID+'/'+execOptions.camID+'-still_'+moment(stats["birthtime"]).format('YYYY-MM-DD_HH-ss')+'.jpg');

									imageMagick(process.env.BASEDIR_STILLS+execOptions.camID+'-still.jpg')
									.resize(240)
									.quality(90)
									.write(process.env.BASEDIR_STILLS+execOptions.camID+'-still_240.jpg', function (err) {
										if(err){
											console.log("Resizing error", err);
										}else{
											console.log("SUCCESS: Resize", execOptions.camID);
//											return true;
										}

									});
									console.log(`SUCCESS: Recompress ${execOptions.camID} (${fileSizeInBytes})`);
								}else{
									console.log("Recompress error", err);
								}

								// console.log(err);
							});

                        } catch (err) {
                          console.error(err)
                        }

                        /// TODO if the size is less than 10KB after generation we should delete it. It probably isn't a good still
                        /// TODO if the bad green color is in there regenerate the still

                }
                catch(e) {
                       console.log(`FAILED: ${execOptions.camID} doesn't exist after generation. `);
                 }

            });


        }  /// end online check
    } /// end for loop

    console.log(`Online cam count: ${camCount}`);


    })


} /// end genStills

genStills();

/// Function to ensure that all started up ffmpeg processes are ended
var kill = function (pid, signal, callback) {
    signal   = signal || 'SIGKILL';
    callback = callback || function () {};
    var killTree = true;
    if(killTree) {
        psTree(pid, function (err, children) {
            [pid].concat(
                children.map(function (p) {
                    return p.PID;
                })
            ).forEach(function (tpid) {
                try { process.kill(tpid, signal) }
                catch (ex) { }
            });
            callback();
        });
    } else {
        try { process.kill(pid, signal) }
        catch (ex) { }
        callback();
    }
};

//setInterval(genStills, 240000);
