# Build images
docker build -t matthewjhcarr/multi-client:latest -t matthewjhcarr/multi-client:$GIT_SHA -f ./client/Dockerfile ./client
docker build -t matthewjhcarr/multi-server:latest -t matthewjhcarr/multi-server:$GIT_SHA -f ./server/Dockerfile ./server
docker build -t matthewjhcarr/multi-worker:latest -t matthewjhcarr/multi-worker:$GIT_SHA -f ./worker/Dockerfile ./worker

# Push images to Docker Hub
docker push matthewjhcarr/multi-client:latest
docker push matthewjhcarr/multi-client:$GIT_SHA
docker push matthewjhcarr/multi-server:latest
docker push matthewjhcarr/multi-server:$GIT_SHA
docker push matthewjhcarr/multi-worker:latest
docker push matthewjhcarr/multi-worker:$GIT_SHA

# Apply k8s config files
kubectl apply -f k8s

# Set latest image on each deployment
kubectl set image deployment/client-deployment client=matthewjhcarr/multi-client:$GIT_SHA
kubectl set image deployment/server-deployment server=matthewjhcarr/multi-server:$GIT_SHA
kubectl set image deployment/worker-deployment worker=matthewjhcarr/multi-worker:$GIT_SHA