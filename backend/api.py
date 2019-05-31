import json
import boto3
import os
import sys

libs = os.path.join(os.getcwd(), 'lib')
sys.path.append(libs)

from collections import defaultdict
from boto3.dynamodb.conditions import Key, Attr


dynamodb = boto3.resource('dynamodb', region_name="us-east-1")
dynamodb_client = boto3.client('dynamodb', region_name="us-east-1")

base_response = {
    "headers": {
        "Access-Control-Allow-Origin" : "*",  # Required for CORS support to work
        "Access-Control-Allow-Credentials" : True  # Required for cookies, authorization headers with HTTPS
    }
}

# Specify the tables used in DynamoDB
QUESTION_TABLE = os.environ['QUESTIONS_TABLE']
VOTES_TABLE = os.environ['VOTES_TABLE']


def get_all_rows(table):
    table = dynamodb.Table(table)
    votes = table.scan()['Items']

    return votes


def get_question(number):
    """Retrieve the a specific question and it's mappings from DynamoDB """

    print "Retrieving question number", number, type(number)

    table = dynamodb.Table(QUESTION_TABLE)
    question = table.get_item(Key={'number': number})

    return question['Item']


def match_question_with_votes(question, votes):
    """Takes both the questions and the vote data and pairs them up"""

    question_text = question['question']
    answers = json.loads(question['answers'])

    # Sort raw vote/button data into a hash of clickType->[button_name]
    votes_mappings = defaultdict(list)
    for vote in votes:
        votes_mappings[vote["payload"]["clickType"]].append(vote)

    answers_text = []
    for x, answer in answers.items():
        answers_text.append({
            "answer": answer,
            "vote_count": len(votes_mappings[x]),
            "click_type": x
        })

    return answers_text


def get_querystring_param(event, param, type_func, default):

    """Retrieve a querystring param from an event or throw an exception"""

    params = event.get("queryStringParameters", None)
    if params:
        try:
            param = type_func(params.get(param, default))
            return param
        except ValueError:
            return dict(base_response, **{
                "statusCode": 400,
                "body": "You must specify {}".format(param)
            })


def cast_vote(event, context):
    """A view that registers a vote into the DynamoDB Table.

    The type of vote depends query string parameter 'clickType'
    """

    # Determine which vote was cast and who the voter is
    click_type = get_querystring_param(event, 'clickType', str, "NA")
    voterID = get_querystring_param(event, 'voterID', int, 0)

    # Insert into DynamoDB
    table = dynamodb.Table(VOTES_TABLE)
    table.put_item(Item={'button': str(voterID), 'payload':{'clickType': click_type}})

    # Return a successful response
    response = dict(base_response, **{
        "statusCode": 200,
        "body": click_type
    })

    return response


def reset_votes(event, context):
    """Delete all vote entries from DynamoDB (resetting back to 0)"""

    pk = 'button'

    # Get all values (to get their PK)
    results = get_all_rows(table=VOTES_TABLE)

    # Delete each row individually using PK
    for row in results:
        dynamodb_client.delete_item(
            TableName=VOTES_TABLE,
            Key={
                pk: {'S': str(row[pk])}
            }
        )

    response = dict(base_response, **{
        "statusCode": 200,
    })

    return response


def get_all_questions(event, context):
    """Retrieve all questions and question data"""

    # Retrieve all the current button statuses
    try:
        table = dynamodb.Table(QUESTION_TABLE)
        results = table.scan()['Items']
    except Exception as ex:
        return dict(base_response, **{
            "statusCode": 500,
            "body": "Unknown exception from Dynamo: {0}".format(type(ex).__name__)
        })

    try:
        questions = [qs['question'] for qs in results]
    except KeyError as ex:
        return dict(base_response, **{
            "statusCode": 500,
            "body": "There is a malformed question"
        })

    body = json.dumps({
        "questions": questions,
        "questions_count": len(results)
    })

    response = dict(base_response, **{
        "statusCode": 200,
        "body": body
    })

    return response


def get_question_votes(event, context):
    """Retrieve all the questions with their corresponding votes at the
    time of the request"""

    # Get question number from ?question query param (one-indexed)
    question_number = get_querystring_param(event, 'question', int, 1)

    # Retrieve the question we want from DynamoDB
    question = get_question(question_number)

    # Retrieve all the current button statuses
    votes = get_all_rows(VOTES_TABLE)

     # Map button statuses to questions and count votes
    answers = match_question_with_votes(question, votes)
    custom_sort = {'SINGLE': 1, "DOUBLE": 2, "LONG": 3}

    body = json.dumps({
        "question_number": question_number,
        "question": question['question'],
        "answers": sorted(answers, key=lambda x: custom_sort.get(x['click_type'], 10)),
        "total_votes": len(votes),
        "total_valid_votes": sum([x["vote_count"] for x in answers])
    })

    response = dict(base_response, **{
        "statusCode": 200,
        "body": body
    })

    return response
