var gm = require('gm');

var imageMagick = gm.subClass({ imageMagick: true });

imageMagick('stills/scboardwalk558-still.jpg')
.enhance()
.autoOrient()
.quality(50)
.write("stills/scboardwalk558-still.jpg_240.jpg", function (err) {
console.log(err);
  if (!err) console.log(' hooray! ');
});
