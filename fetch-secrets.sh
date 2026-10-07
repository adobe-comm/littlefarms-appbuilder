#!/bin/bash

main (){

    config=$(aio config ls --json)

    # Extract workspace_services
    workspace_services=$(echo "$config" | jq -c '.project.workspace.details.services')

    # Check if I/O Management API is present
    if ! echo "$workspace_services" | jq -e 'any(.[]; .code == "AdobeIOManagementAPISDK")' > /dev/null; then
    echo "Error: I/O Management API was not found in your workspace." >&2
    exit 1
    fi

    # Get the lowercase context name
    ctx=$(echo "$config" \
        | jq -r '.project.workspace.details.credentials[] | select(.integration_type == "oauth_server_to_server") | .name' \
        | tr '[:upper:]' '[:lower:]'
    )

    echo "CLIENTID:                     $(echo "$config" | jq -r --arg ctx "$ctx" '.ims.contexts[$ctx].client_id')"
    echo "CLIENTSECRET:                 $(echo "$config" | jq --arg ctx "$ctx" '.ims.contexts[$ctx].client_secrets' |  jq -r | jq -r '.[0]')"
    echo "TECHNICALACCID:               $(echo "$config" | jq -r --arg ctx "$ctx" '.ims.contexts[$ctx].technical_account_id')"
    echo "TECHNICALACCEMAIL:            $(echo "$config" | jq -r --arg ctx "$ctx" '.ims.contexts[$ctx].technical_account_email')"
    echo "IMSORGID:                     $(echo "$config" | jq -r --arg ctx "$ctx" '.ims.contexts[$ctx].ims_org_id')"
    echo "SCOPES:                       $(echo "$config" | jq --arg ctx "$ctx" '.ims.contexts[$ctx].scopes' | jq -r | jq -r '. | join(",")')"
    echo "AIO_RUNTIME_NAMESPACE:        $(echo "$config" | jq -r '.runtime.namespace')"
    echo "AIO_RUNTIME_AUTH:             $(echo "$config" | jq -r '.runtime.auth')"
    echo "AIO_PROJECT_ID:               $(echo "$config" | jq -r '.project.id')"
    echo "AIO_PROJECT_NAME:             $(echo "$config" | jq -r '.project.name')"
    echo "AIO_PROJECT_ORG_ID:           $(echo "$config" | jq -r '.project.org.id')"
    echo "AIO_PROJECT_WORKSPACE_ID:     $(echo "$config" | jq -r '.project.workspace.id')"
    echo "AIO_PROJECT_WORKSPACE_NAME:   $(echo "$config" | jq -r '.project.workspace.name')"
    echo "AIO_PROJECT_WORKSPACE_DETAILS_SERVICES:   $(echo "$config" | jq -r -c '.project.workspace.details.services')"
}

main
