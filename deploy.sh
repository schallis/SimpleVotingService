#/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}"  )" && pwd  )"

sam deploy \
    --template-file $SCRIPT_DIR/sss-packaged-template.yaml \
    --stack-name "simplesurveyservice-`date '+%d-%m-%y-%H-%M'`" \
    --capabilities CAPABILITY_IAM

#aws s3 sync $SCRIPT_DIR/frontend/ s3://simplesurveyservice-public/
