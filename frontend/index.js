'use strict'
const https = require('https')
const url = require('url')
const fs = require('fs')
const AWS = require('aws-sdk')
const AdmZip = require('adm-zip')
const async = require('async')
var mime = require('mime')

const constants = {
    SUCCESS: 'SUCCESS',
    FAILED: 'FAILED',
    UPDATE: 'Update',
    CREATE: 'Create',
    DELETE: 'Delete'
}

const s3 = new AWS.S3({"signatureVersion":"v4"})

exports.handler = (event, context, callback) => {
    console.log(event)

    const requestType = event.RequestType
    const resourceOptions = requestType === constants.DELETE ? {} : event.ResourceProperties.Options

    if (event.LogicalResourceId != "WebsiteDeployment") {
        return sendCloudFormationResponse(constants.FAILED, { message: `Invalid LogicalResourceId: ${event.LogicalResourceId}` })
    }

    switch (requestType) {
        case constants.CREATE:
        case constants.UPDATE:
            return uploadArtifacts(resourceOptions)
        case constants.DELETE:
            return cleanBucket(event.PhysicalResourceId)
        default:
            return sendCloudFormationResponse(constants.FAILED, { message: `Invalid request type ${requestType}` })
    }

    function cleanBucket(resourceId) {
        if (!resourceId || resourceId == "") {
            return sendCloudFormationResponse(constants.FAILED, { message: `Invalid physical resource id: ${resourceId}` })
        }
        const bucketName = resourceId.split("::")[1]
        s3.listObjects({Bucket: bucketName}, function (err, data) {
            if (err) {
                return sendCloudFormationResponse(constants.FAILED, { message: `Could not list bucket objects: ${err}` })
            }
            let items = data.Contents;
            for (var i = 0; i < items.length; i += 1) {
                let deleteParams = {Bucket: bucket, Key: items[i].Key};
                s3.deleteObject(deleteParams, function(err, data) {
                    if (err) {
                        return sendCloudFormationResponse(constants.FAILED, { message: `Could not delete object: ${items[i].Key}` })
                    }
                })
            }
        });

        return sendCloudFormationResponse(constants.SUCCESS, { message: 'OK' }, resourceId)
    }


    function uploadArtifacts(resourceOptions) {
        if (!resourceOptions || !resourceOptions["SourceBucket"] ||
            !resourceOptions["SourceArtifact"] || !resourceOptions["DestinationBucket"]) {

            return sendCloudFormationResponse(constants.FAILED, {
                message: 'Missing required options: SourceBucket, SourceArtifact, DestinationBucket'
            })
        }

        const sourceBucket = resourceOptions.SourceBucket
        const sourceArtifact = resourceOptions.SourceArtifact
        const destinationBucket = resourceOptions.DestinationBucket
        const physicalResourceId = 'Deployment::' + resourceOptions.DestinationBucket

        const tmpSourceArtifact = '/tmp/artifact.zip'
        const tmpPackageZip = '/tmp/package.zip'

        // get source artifact
        s3.getObject({ Bucket: sourceBucket, Key: sourceArtifact}, function(err, data) {
            if (err) {
                return sendCloudFormationResponse(constants.FAILED, { message: `Could not fetch artifact: ${sourceBucket}/${sourceArtifact}: ${err}` })
            }

            try {
                fs.writeFileSync(tmpSourceArtifact, data.Body, { encoding: 'binary' })
            } catch (ex) {
                return sendCloudFormationResponse(constants.FAILED, { message: `Could not save artifact to disk: ${ex}` })
            }

            let artifactZip = new AdmZip(tmpSourceArtifact)
            let packageFound = false

            let zipEntries = artifactZip.getEntries()

            zipEntries.forEach(function(zipEntry) {
                if (zipEntry.entryName == "package.zip") {
                    console.log("Found package.zip file")
                    packageFound = true
                    try {
                        artifactZip.extractEntryTo(zipEntry, '/tmp', true, true)
                    } catch (ex) {
                        return sendCloudFormationResponse(constants.FAILED, { message: `Could not save package to disk: ${ex}` })
                    }
                }
            })

            if (!packageFound) {
                return sendCloudFormationResponse(constants.FAILED, { message: 'Could not package.zip in artifact' })
            }

            const deploymentDir = '/tmp/dist'

            if (fs.existsSync(deploymentDir)){
                deleteFolderRecursive(deploymentDir)
            }

            fs.mkdirSync(deploymentDir);

            let packageZip = new AdmZip(tmpPackageZip)
            let packageEntries = packageZip.getEntries()
            let asyncTasks = []
            packageEntries.forEach(function(entry) {
                console.log("Processing entry " + entry.entryName)
                if (entry.isDirectory) {
                    return
                }
                asyncTasks.push(function(callback) {
                    packageZip.extractEntryTo(entry, deploymentDir, true, true)
                    let fileName = deploymentDir + "/" + entry.entryName
                    let fileData = fs.readFileSync(fileName)
                    let s3FileProperties = {
                        Bucket        : destinationBucket,
                        Key           : entry.entryName,
                        ContentLength : fileData.length,
                        Body          : fileData,
                        ContentType   : mime.lookup(fileName)
                    }

                    s3.putObject(s3FileProperties, function(err, data) {
                        if(err)
                            callback(err, entry.entryName)
                        else
                            callback(null, data.Key)
                    })
                })
            })

            async.parallel(asyncTasks, function(err, result) {
                if (err)
                    return sendCloudFormationResponse(constants.FAILED, { message: `Error while uploading ${result} to destination bucket: ${err}` })
                else
                    return sendCloudFormationResponse(constants.SUCCESS, { message: 'OK' }, physicalResourceId)
            })

        })

        function deleteFolderRecursive(path) {
            if( fs.existsSync(path) ) {
                fs.readdirSync(path).forEach(function(file,index){
                    var curPath = path + "/" + file;
                    if(fs.lstatSync(curPath).isDirectory()) { // recurse
                        deleteFolderRecursive(curPath);
                    } else { // delete file
                        fs.unlinkSync(curPath);
                    }
                });
                fs.rmdirSync(path);
            }
        };
    }


    function sendCloudFormationResponse(responseStatus, responseData, physicalResourceId) {
        const responseBody = JSON.stringify({
            Status: responseStatus,
            Reason: `See the details in CloudWatch Log Stream: ${context.logStreamName}`,
            PhysicalResourceId: physicalResourceId || context.logStreamName,
            StackId: event.StackId,
            RequestId: event.RequestId,
            LogicalResourceId: event.LogicalResourceId,
            Data: responseData
        })

        console.log(`Response body:
			${responseBody}`)

        const parsedUrl = url.parse(event.ResponseURL)
        const requestOptions = {
            hostname: parsedUrl.hostname,
            port: 443,
            path: parsedUrl.path,
            method: 'PUT',
            headers: {
                'content-type': '',
                'content-length': responseBody.length
            }
        }

        return new Promise((resolve, reject) => {
            const request = https.request(requestOptions, resolve)

            request.on('error', e => reject(`http request error: ${e}`))
            request.write(responseBody)
            request.end()
        })
            .then(() => callback(responseStatus === constants.FAILED ? responseStatus : null, responseData))
            .catch(callback)
    }
}
