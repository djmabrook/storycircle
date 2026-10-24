#!/usr/bin/env bash
# One-time setup, run in Google Cloud Shell: lets GitHub Actions for djmabrook/storycircle
# deploy to Firebase Hosting without a service account key.
set -euo pipefail
PROJECT=storycircle-37772
REPO=djmabrook/storycircle
SA=github-deployer@$PROJECT.iam.gserviceaccount.com

gcloud config set project "$PROJECT"
gcloud services enable iamcredentials.googleapis.com sts.googleapis.com firebasehosting.googleapis.com
gcloud iam service-accounts describe "$SA" >/dev/null 2>&1 || gcloud iam service-accounts create github-deployer --display-name="GitHub deployer"
for role in roles/firebasehosting.admin roles/firebase.viewer roles/serviceusage.serviceUsageConsumer; do
  gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$SA" --role="$role" --condition=None --quiet >/dev/null
done
gcloud iam workload-identity-pools describe github --location=global >/dev/null 2>&1 || \
  gcloud iam workload-identity-pools create github --location=global --display-name="GitHub"
gcloud iam workload-identity-pools providers describe storycircle --location=global --workload-identity-pool=github >/dev/null 2>&1 || \
  gcloud iam workload-identity-pools providers create-oidc storycircle --location=global --workload-identity-pool=github \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
    --attribute-condition="assertion.repository=='$REPO'"
NUM=$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')
gcloud iam service-accounts add-iam-policy-binding "$SA" --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$NUM/locations/global/workloadIdentityPools/github/attribute.repository/$REPO" --quiet >/dev/null
echo
echo "Done. Send this line to Claude:"
echo "projects/$NUM/locations/global/workloadIdentityPools/github/providers/storycircle"
