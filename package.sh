#/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}"  )" && pwd  )"

sam package \
    --template-file $SCRIPT_DIR/template.yaml \
    --s3-bucket challiss-simplesurveyservice-greatdemo \
    --s3-prefix artifacts \
    --output-template-file $SCRIPT_DIR/sss-packaged-template.yaml \
