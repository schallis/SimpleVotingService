'use strict';
var AWS = require('aws-sdk');
var s3 = new AWS.S3({WS
  apiVersion: '2012–09–25'
});
var eltr = new AWS.ElasticTranscoder({
  apiVersion: '2012–09–25',
    region: 'us-east-1'
});

exports.handler = function(event, context) {
  console.log('Executing Elastic Transcoder Orchestrator');
  var bucket = event.Records[0].s3.bucket.name;
  var key = event.Records[0].s3.object.key;
  var pipelineId = '1488509513296-i9m26w';
  if (bucket !== 'octavote-raw') {
    context.fail('Incorrect Video Input Bucket= '+bucket);
    return;
  }

  var srcKey =  decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, " "));

  /* Insert new video name into Dynamo DB */
  AWS.config.update({
    region: "us-east-1",
    endpoint: "http://localhost:8000"
  });

  var docClient = new AWS.DynamoDB.DocumentClient();

  var table = "octavote-videos";

  var ts = Math.floor(new Date() / 1000);
  var filename = 'octavote-' + ts;

  var input_params = {
    TableName:table,
    Item:{
      "filename": filename
    }
  };

  console.log("Adding a new item...");
  docClient.put(input_params, function(err, data) {
    if (err) {
      console.error("Unable to add item. Error JSON:", JSON.stringify(err, null, 2));
    } else {
      console.log("Added item:", JSON.stringify(data, null, 2));
    }
  });

  /* End Dynamo */


  var newKey = 'videos';
  var params = {
    PipelineId: pipelineId,
    OutputKeyPrefix: newKey + '/',
    Input: {
      Key: srcKey,
      FrameRate: 'auto',
      Resolution: 'auto',
      AspectRatio: 'auto',
      Interlaced: 'auto',
      Container: 'auto'
    },
    Outputs: [{
               //Key: 'mp4-' + newKey + '.mp4',
               Key: filename + '.mp4',
               ThumbnailPattern: 'thumbs-' + filename + newKey + '-{count}',
               PresetId: '1351620000001-000010', //Generic 720p
               //Watermarks: [{
               //InputKey: 'watermarks/logo-horiz-large.png',
               //PresetWatermarkId: 'BottomRight'
               //}],
             },{
               //Key: 'webm-' + newKey + '.webm',
               Key: filename + '.webm',
               ThumbnailPattern: '',
               PresetId: '1351620000001-100240', //Webm 720p
               //Watermarks: [{
               //InputKey: 'watermarks/logo-horiz-large.png',
               //PresetWatermarkId: 'BottomRight'
               //}],
             }]
  };


  console.log('Starting Job');
  eltr.createJob(params, function(err, data){
    if (err){
      console.log(err);
    } else {
      console.log(data);
    }
    context.succeed('Job well done');
  });

};
