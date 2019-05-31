Requirements
============
Serverless == 1.7

Deployment
==========
Ensure all modules are included in the deployment package by running the
following before deploying:

    pip install -t lib/ -r requirements.txt


TODO: I'm hoping to find a better way to install these without cluttering up
the root directory.

Running
=======
Run with:

    sls invoke -f get_question_votes
