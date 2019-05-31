#/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}"  )" && pwd  )"

aws dynamodb batch-write-item --request-items file://$SCRIPT_DIR/data/questions.json
