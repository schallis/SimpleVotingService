import os
import json
import boto3
import pystache
import requests

s3 = boto3.resource('s3')
s3_client = boto3.client('s3')
dynamodb = boto3.resource('dynamodb', region_name="us-east-1")
dynamodb_client = boto3.client('dynamodb', region_name="us-east-1")

def build_response(event, status):
    response_data = {
        'Status': status,
        'Reason': 'Created successfully',
        'PhysicalResourceId': 'simplesurveyservice::{}'.format(event['LogicalResourceId']),
        'Data': {},
        'RequestId': event['RequestId'],
        "LogicalResourceId": event["LogicalResourceId"],
        "StackId": event["StackId"],
    }
    return response_data

def deploy_index_to_s3(event, context):

    try:
        request_type = event['RequestType']
        print "RequestType is: {}, {}".format(request_type, type(request_type))

        api_url = os.environ.get('API_URL', "No API_URL configured")
        static_url = os.environ.get('STATIC_URL', "No STATIC_URL configured")
        dest_bucket = os.environ.get('DEST_BUCKET', "No DEST_BUCKET configured")

        if "Delete" == request_type:
            # Delete contents of S3 bucket we populated (else it won't delete)
            bucket = s3.Bucket(dest_bucket)
            print 'Deleting all files in bucket', dest_bucket
            for f in bucket.objects.all():
                print "deleting file", f
                f.delete()
        else:
            # Retrieve Mustache template to generate HTML from
            print "Creating files in bucket", dest_bucket
            s3_obj = s3.Object('challiss-simplesurveyservice', 'index.mustache')
            mustache_template = s3_obj.get()["Body"].read()
            renderer = pystache.Renderer()
            rendered = renderer.render(mustache_template, {'API_URL': api_url,
                'STATIC_URL': static_url})

            # Write updated static HTML to S3 for consumption
            s3_client.put_object(Bucket=dest_bucket, Key="index.html", Body=rendered,
                    ACL='public-read', ContentType='text/html')

        response_data = build_response(event, 'SUCCESS')
    except Exception, exc:
        print exc
        response_data = build_response(event, 'FAILED')

    # Ping Cloudformation to let it know we are done
    response_url = event['ResponseURL']
    r = requests.put(response_url, data=json.dumps(response_data))

    return r

def setup_dynamo(event, context):

    try:
        # Update Dynamo with data
        table_name = os.environ.get('QUESTIONS_TABLE')
        table = dynamodb.Table(table_name)
        table.put_item(Item={
            'number': 1,
            'question': 'Which database offering is most suited to NoSQL?',
            'answers': '{"SINGLE": "RDS", "DOUBLE": "DynamoDB", "TRIPLE": "Redshift"}'})
        table.put_item(Item={
            'number': 2,
            'question': 'What is the recommended way of scaling compute resources?',
            'answers': '{"SINGLE": "Increase the instance size. Bigger is always better!", "DOUBLE": "Use smaller instances but more of them (in an autoscaling configuration)", "TRIPLE": "Not sure"}'})

        response_data = build_response(event, 'SUCCESS')
    except Exception, exc:
        print exc
        response_data = build_response(event, 'FAILED')

    # Ping Cloudformation to let it know we are done
    response_url = event['ResponseURL']
    r = requests.put(response_url, data=json.dumps(response_data))

    return r


if __name__ == '__main__':
    print deploy_index_to_s3({'ResponseURL': 'https://responseurl'}, None)
