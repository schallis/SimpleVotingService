Overview
========
This is a simple voting app that allows users to go to a webpage and click on
various options. There is no authentication. The questions/answers are stored
in DynamoDB and there is no UI within this app to edit them.

The website is served as static HTML/JS from a public S3 bucket. The backend is
comprised of Lambda functions that read/write from DynamoDB.

An AWS SAM (CloudFormation) template are included which deploy the app from scratch
with a default set of questions and returns the URL of the S3 bucket which can
be used to access the app.

*Note* the template should be modified to not use a public S3 bucket but
instead expose the website behind a Cloudfront Distribution.

Development
===========

A couple of things require compilation/packaging:
- The static HTML website is generated from a Mustache template so that the API
  URL can be dynamically inserted before it appears on S3. This transformation
  happens in the Custom Resource lambda during deployment.
- The Cloudformation template is generated using SAM to package and deploy the
  code artifact then generate a new CF template with correct code URLs in it.
  This happens before you deploy.

So each time you want to make updates to the code you want to run::

    ./package.sh && ./deploy.sh


These scripts contain the appropriate Cloudformation CLI commands.
