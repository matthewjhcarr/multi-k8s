# Multi-Container App with Kubernetes
The overall architecture of our multi-container application is demonstrated below:

![multi container kubernetes architecture](./img/multi-k8s-arch.png)

_Note: once deployed, we won't be limited to a single node, but it simplifies things for this diagram._

Our 'path to production' is loosely summarized as follows:

1. Create config files for each service and deployment
2. Test locally using minikube
3. Create a GitHub/Travis workflow to build images and deploy
4. Deploy application to a cloud provider

This can be generally be considered a good path to follow for any future projects.

## What is a ClusterIP service?
A __ClusterIP__ service is a service which exposes a set of pods to _other objects in the cluster_. This differs from what we were previously using during development, __NodePort__, in that NodePort exposed pods to the _outside world_. This was useful during development because we wanted to be able to see into our cluster whenever we wanted. However, in production, we don't really want people gaining access to the cluster that way.  
ClusterIP is part of what allows us to control access to the cluster in a stricter and safer way.

### Example
```
apiVersion: v1
kind: Service
metadata:
  name: client-cluster-ip-service
spec:
  type: ClusterIP
  selector:
    component: web
  ports:
    - port: 3000
      targetPort: 3000
```
As you can see, the ClusterIP configuration file differs from the NodePort file in that there is no `nodePort` property (obviously). This is because ClusterIP services do not allow direct access to objects from the outside world, so there is no need to expose a port for that purpose.

## Combining configuration files
Technically it is possible to combine configuration files into a single file. There is no limit to the number of objects you can define within a single configuration file. It might make sense to combine, say, a deployment configuration with it's corresponding clusterip configuration.

The way you would combine these configurations is by separating them through the use of three '-' dashes. For example:

```
apiVersion: apps/v1
kind: Deployment
metadata:
  name: client-deployment
spec:
  replicas: 3
  selector:
    matchLabels:
      component: web
  template:
    metadata:
      labels:
        component: web
    spec:
      containers:
        - name: client
          image: matthewjhcarr/multi-client
          ports:
            - containerPort: 3000
---
apiVersion: v1
kind: Service
metadata:
  name: client-cluster-ip-service
spec:
  type: ClusterIP
  selector:
    component: web
  ports:
    - port: 3000
      targetPort: 3000
```

However, having said that, we will not be doing this in this course for clarity purpose. Having the configuration for each object in its own file makes it immediately obvious how many different objects exist as well as the name of those objects, and allows another dev to easily find the configuration file they need.

## Creating volumes
A PVC works very similarly to a volume. To imagine why we might need something like that consider the following: If we had one single pod running our postgres database, and that pod crashed - what happens to all our data? Gone! Poof!

Obviously, that's not what we want, so we might use something like a volume to ensure that there is a copy of a file system that a database can always be accessed.

This is what we want: we want to create a 'volume' on the _host machine_ that contains some amount of data/a file system. This 'volume' should then always be accessible to the cluster, i.e. it is __persistent__, even if the running instance of postgres crashes.

Now, don't forget, you should always have no more than __one__ independant copy of a database accessing the _same_ volume, because that's clearly a bad idea (think: lockout)

### Different 'Volumes'
#### 'Volume'
A _Kubernetes_ `Volume` is an object that allows a container to store data at the pod level. __This is not the same as a Docker Volume.__

With Kubernetes Volumes, if a container crashes, a newly created container will still have access to the data within the volume, as it has been store at the pod level. However, the trouble is that if the _pod_ crashes, the volume is also lost.

We also have access to two other kinds of objects within Kubernetes: `Persistent Volume` and `Persistent Volume Claim`.

#### Persistent Volume
With a `Persistent Volume`, we are creating some type of long-term durable storage _outside_ of the pod. This means that if either the container _or_ the pod crash, the data will still be available when either that container or pod is recreated. In other words, the volume __persists__.

To associate a persistent volume to a deployment, we would add the following at the top of the `spec` section of our deployment template:
```
spec:
  volumes:
    - name: postgres-storage
      persistentVolumeClaim:
        claimName: database-persistent-volume-claim
```
The `claimName` should be whatever name we give the Persistant Volume Claim in its config file. _See the next section for more information on this._

We also need to assign this storage for use by all the different containers inside our pod. We do this by adding the following to the end of the `containters` section of our template, beneath the ports:
```
spec:
  ...
      volumeMounts:
        - name: postgres-storage
          mountPath: /var/lib/postgresql/data
          subPath: postgres
```
##### name
The `name` of the `volumeMount` __must__ match the `name` of our `volume` defined above.
##### mountPath
This is the path to the directory that we wish to create a volume from. For our purposes, we have specified the path that postgres stores its data.
##### subPath
This is an optional property _(which is **very** specific to postgres)_ that specifies the name of the folder we wish to create within the persistent volume. All of the data from the `mountPath` will be stored inside the persistent volume within a folder named with the value of `subPath`.

#### Persistent Volume Claim
A `Persistent Volume Claim` can be thought of as a billboard advertising hard drives. Bear with me.

A PVC is __not__ an actual volume, it is simply an _advertisement_ of the storage options available within the cluster.

We can use the PVC to specify what Persistent Volumes can be requested from Kubernetes. Kubernetes will then either provide a _statically provisioned_ Persistent Volume (created ahead of time/already available), or will provide a _dynamically provisioned_ Persistent Volume (created upon request), if no appropriate statically provisioned option exists.

The config file for a PVC will looks something like the following:
```
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: database-persistent-volume-claim
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 2Gi
```
##### accessModes
An Access Mode comes in three flavours:

- ReadWriteOnce - can be used by a __single node__
- ReadOnlyMany  - __multiple nodes__ can __read__ from this 
- ReadWriteMany - can be __read by__ and __written to__ from __many nodes__

##### storage
`storage: 2Gi`  
This specifies that Kubernetes will have to find a storage option (statically or dynamically provisioned) that has exactly __2GB__ of space.

`storageclass`  
When we move to _production_, we may need to specify how we want kubernetes to provision storage, since every cloud provider has a different way of doing this _(e.g. Google Cloud Persistent Disk, Azure File, Azure Disk, AWS Block Store, etc.)_.  
If you do not specify anything, k8s will use whatever the default option is on the host machine (e.g. if you deploy to AWS, it will use Block Store)

## Environment Variables
Here's a handy diagrams of all the different environment variables we use:

![environment variables](./img/envvars.png)

- REDIS_HOST:
    This will be the name of our redis ClusterIP service (e.g. redis-cluster-ip-service)
- REDIS_PORT:
    This will be the port we defined within our redis ClusterIP service (e.g. 6379)
- PG_USER:
    Whatever user you are using for your pg database. For our purposes we use the default `postgres` user.
- PGHOST:
    The name of our postgres ClusterIP service (e.g. postgres-cluster-ip-service)
- PGDATABASE:
    The name of our postgres database. For our purposes, we are using the default pg database: `postgres`.
- PGPORT:
    The port we defined within our postgres ClusterIP service (e.g. 5432)
- POSTGRES_PASSWORD:
    This must be added in a secure way, since we don't want to expose this password. For this, we will use a `Secret` object.

Here is an example of how we add the environment variables to our server deployment config file:

```
apiVersion: apps/v1
kind: Deployment
metadata:
  name: server-deployment
spec:
  replicas: 3
  selector:
    matchLabels:
      component: server
  template:
    metadata:
      labels:
        component: server
    spec:
      containers:
        - name: server
          image: matthewjhcarr/multi-server
          ports:
            - containerPort: 5000
          env:
            - name: REDIS_HOST
              value: redis-cluster-ip-service
            - name: REDIS_PORT
              value: '6379'
            - name: PGUSER
              value: postgres
            - name: PGHOST
              value: postgres-cluster-ip-service
            - name: PGDATABASE
              value: postgres
            - name: PGPORT
              value: '5432'
```

__NOTE: ENVIRONMENT VARIABLES CANNOT BE INTEGERS. THEY MUST ALWAYS BE STRINGS. IF ENTERING PORT NUMBERS, WRAP THEM IN QUOTES!__

## Secrets
A `Secret` is a kubernetes object that can be used to securely store one or more pieces of information inside of a cluster. For example: passwords, API keys, SSH keys, etc.

To create a secret, we will use an imperative command. This is because we don't want to create the secret using a config file, since writing out the secret in plain text in a config file would defeat the point of encoding it in the first place.

The command we use to create a secret is as follows:
```
kubectl create secret generic <secret name> --from-literal <key>=<value>
```
Creates a secret  
`create`: An imperative command to create a new object  
`secret`: The kind of object we want to create  
`generic`: The type of secret we are creating. The other two types are `docker-registry` (for auth against a custom docker registry) and `tls` (related to HTTPS setup)  
`<secret name>`: The name of our secret for referencing purposes  
`--from-literal`: Indicates that the secret will be entered with this command and not from a file  
`<key>=<value>`: The actual secret as a key-value pair

## Passing Secrets as Environment Variables
In order to pass a secret as an environment variable, we must add the following to our config file:
```
env:
  ...
  - name: PGPASSWORD
    valueFrom:
      secretKeyRef:
        name: pgpassword
        key: PGPASSWORD
```
#### name
This is the name of our __environment variable__. This is _unrelated_ to the actual secret.
#### secretKeyRef
##### name
This is the name we defined when creating the secret. We would be able to see this name listed if we used the `kubectl get secrets` command.
##### key
This is the key from the key-value pair of our secret. In this specific case, it is also `PGPASSWORD`, but generally it would be whatever was used on the LHS of the '=' operator in the `kubectl create secret...` command.

## Traffic Control with Ingress
### The duality of man. Er, projects.
In this project, we will be using __ingress-nginx__. This is a _community led project_ run by people involved in kubernetes. [Here](https://github.com/kubernetes/ingress-nginx) is the github.

The is a _completely separate_ project called __kubernetes-ingress__. This project is led be _the company nginx_. The github repo can be found [here](https://github.com/nginxinc/kubernetes-ingress).

It is __very easy__ to mix up documentation for these two projects. Please make sure you're looking at the right one.

### A few notes on setup
The setup of ingress-nginx changes depending on what environment you are setting it up on (local, Google Cloud, AWS, Azure, etc). In this course we focus on Google Cloud and local setup.

### Ingress Controller
In Kubernetes, a 'controller' is any object that constantly works to make some desired state a reality inside of our cluster.

A 'Deployment' is one kind of Controller, in that it constantly works to make sure a certain number of pods exist configured in a specific way.

We also will create an 'Ingress Controller' which will work to ensure that the routing setup matches our desired setup, which we define through Ingress routing rules within a config file.

A high level illustration of this setup might look like this:

![ingress general](./img/ingress.png)

The implementation we are using actually combines the controller and the router, so it actually looks more like this:

![ingress-nginx](./img/ingress-nginx.png)

But these diagrams are basically the same.

### Google Cloud architecture
The architecture of our application when deployed to Google Cloud will look more or less like this:

![ingress nginx google cloud](./img/ingress-nginx-gc.png)

The important thing to note in this diagram are as follows:

#### GC Load Balancer
The way Google Cloud actually handles routing traffic behind the scenes is through use of a Load Balancer. We don't have to concern ourselves too much with this detail, it's just useful to know.

GC routes traffic from it's cloud provided load balancer to a local load balancer service attached to our ingress-nginx deployment.

#### Ingress-nginx Deployment
This deployment contains our Ingress Controller and an Nginx pod. The controller watches for changes and updates the nginx pod when necessary, and the pod routes traffic to the appropriate ClusterIP services.

#### Default backend deployment
This default-backend deployment is used for a series of health checks to ensure that the cluster is working as expected.

In an ideal world, we would replace the default-backend pod with our Express API server. This would allow the nginx pod to reach out to the Express API server when performing health checks. We will cover how to do this later.

### Ingress setup
To install the ingress add-on locally, use the following command:

__LINUX__
```
minikube addons enable ingress
```

__WINDOWS__
```
TODO
```

__MAC__
```
TODO
```

### Ingress configuration
The configuration file for the ingress server should look something like this:
```
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ingress-service
  annotations:
    kubernetes.io/ingress.class: nginx
    nginx.ingress.kubernetes.io/use-regex: 'true'
    nginx.ingress.kubernetes.io/rewrite-target: /$1
spec:
  rules:
    - http:
        paths:
          - path: /?(.*)
            pathType: Prefix
            backend:
              service:
                name: client-cluster-ip-service
                port:
                  number: 3000
          - path: /api/?(.*)
            pathType: Prefix
            backend:
              service:
                name: server-cluster-ip-service
                port:
                  number: 5000
```
#### annotations
Annotations are additional configuration options that specify higher level configuration options around the ingress object that gets created.

`kubernetes.io/ingress.class: nginx`  
This tell k8s that we want to create an Ingresscontroller based on the nginx project

`nginx.ingress.kubernetes.io/use-regex: true`  
This tells nginx that we want to use regex on our routes

`nginx.ingress.kubernetes.io/rewrite-target: /$1`  
This tells nginx that we want to rewrite any routes with a leading `/api` and remove `/api`.

#### rules/http
The `rule` property is an array where we define our routing rules.

The `http` property just specifies that these are rules for http routing

##### paths
The `paths` property is an array consisting of individual routing rules where we define the following:

`path:` The path this rule applies to  
`pathType:` Where in the URL this path occurs (i.e. prefix, suffix, etc)  
`service:` The service (probably a ClusterIP service) we want to route traffic to if the path matches  
`name:` The name of the service  
`port:/number:` The port number exposed by that service.

## Production!
### Travis configuration
The following diagram displays the steps we will need to take when defining our travis configuration file for our project:

![travis config](./img/travis-config.png)

```
sudo: required
services:
  - docker
env:
  global:
    - GIT_SHA=$(git rev-parse HEAD)
    # Disables prompts from the Google Cloud CLI because we can't interact
    - CLOUDSDK_CORE_DISABLE_PROMPTS=1
before_install:
  # Generated by Travis to use our encrypted json file
  - openssl aes-256-cbc -K $encrypted_9f3b5599b056_key -iv $encrypted_9f3b5599b056_iv -in service-account.json.enc -out service-account.json -d
  # Download and install google SDK
  - curl https://sdk.cloud.google.com | bash > /dev/null;
  # Apply additional config from google SDK
  - source $HOME/google-cloud-sdk/path.bash.inc
  # Install and update kubectl inside travis environment
  - gcloud components update kubectl
  # Configure SDK with Google Cloud auth info
  - gcloud auth activate-service-account --key-file service-account.json
  # Set some Google Cloud CLI config properties
  - gcloud config set project sublime-habitat-328812
  - gcloud config set compute/zone europe-west2-a
  - gcloud container clusters get-credentials multi-cluster
  # Login to docker
  - echo "$DOCKER_PASSWORD" | docker login -u "$DOCKER_USERNAME" --password-stdin
  # Build test image
  - docker build -t matthewjhcarr/react-test -f ./client/Dockerfile.dev ./client

script:
  # Test script
  - docker run -e CI=true matthewjhcarr/react-test yarn test

deploy:
  provider: script
  script: bash ./deploy.sh
  on:
    branch: main
```

#### Service account
```
before_install:
  # Generated by Travis to use our encrypted json file
  - openssl aes-256-cbc -K $encrypted_9f3b5599b056_key -iv $encrypted_9f3b5599b056_iv -in service-account.json.enc -out service-account.json -d
  ...
  # Configure SDK with Google Cloud auth info
  - gcloud auth activate-service-account --key-file service-account.json
  ...
```
`activate-service-account` is equivalent to setting up an IAM user on AWS. In fact, google has its own interface to create an IAM user.

We will create the `service-account.json` file using Google Cloud and then upload it to Travis. However, since this file contains sensitive information, we will encrypt it using the Travis CI CLI before uploading it to our Travis account, which will prevent it from being viewed by the outside world.

__UNDER NO CIRCUMSTANCES SHOULD THIS FILE BE UPLOADED TO GITHUB OR OTHERWISE EXPOSED.__

##### Creating the JSON file
On the google console, naviagte to the Service account settings by going to Hamburger icon > IAM & Admin > Service Accounts and click "Create service account".

Name the account something sensible, i.e. 'travis-deployer', and click "Create and continue"

Search for and select the role 'Kubernetes Engine Admin' and click "Continue"

There is no need to grant users access to the service account, so click "Done".

Now we see a table containing the service account we just created. Click the three dots in the "Actions" column on our new account and click "Manage keys".

Click "Add key" and then "Create new key".

Ensure Key type is set to JSON amd click "Create".

Download and save the JSON key file.

##### Encrypting and upload file
To install Travis CI CLI, we need Ruby installed. That's kind of an unnecessary pain, but lo and behold we can use Docker to help us out!

Steps are as follows:

1. Download and install a ruby image
    Ensure you are within your project directory _(i.e. the github repo directory)_ Then execute the following command:

        docker run -it -v $(pwd):/app ruby:2.4 sh
    
    This command will start up a ruby container, map the present working directory (your project dir) to the `/app` folder within the container, and start up a shell within the container.
2. Install travis
    To do this, execute the following command:
        
        gem install travis

    This command is the ruby command to install packages
3. Create a Personal Access Token on GitHub to allow travis to login
    This is pretty straightforward. In GitHub, navigate as follows:
    
    > Settings \> Developer settings \> Personal access tokens \> Generate new token

    Select the following scope:  
    - `user:email`
    - `read:org`
    - `repo`

    It's fine to set the expiration for this token as around a day, we don't need it for long.

    Generate the token and copy it to your clipboard
4. Login with travis in the Ruby shell
    Back in your terminal execute the following command:

        travis login --github-token <YOUR TOKEN> --com

    This tells travis that we want to associate our files and settings with our personal travis account.
5. Copy our service account JSON file into the volumed dir (aka our project dir)
    Rename the copied file to `service-account.json`.

    __NOTE: DO NOT COMMIT THIS JSON FILE. DELETE IT ONCE YOU'RE DONE__
6. Encrypt our json file using travis
    To encrypt the file, we run the following command:

        travis encrypt-file service-account.json -r <our github repo> --com
    
    This encrypts the file and ties it to our repository.
7. Copy the entire command that travis recommends adding to the start of the build script. It should start with `openssl` and end with `-d`
    This tells travis to use the encrypted file that we just created.
8. Delete our local copy of `service-account.json` and include `service-account.json.enc` in our commit
9. Exit the ruby container with the following command:
        exit
10. Commit the new encrypted file to github

#### Google Cloud config
```
before_install:
  ...
  # Set some google cloud config properties
  - gcloud config set project sublime-habitat-328812
  - gcloud config set compute/zone europe-west2-a
  - gcloud container clusters get-credentials multi-cluster
```

The lines above set some configuration for the google cloud CLI. We need to set our desired project (e.g. `sublime-habitat-328812`), our location (e.g. `europe-west2-a`), and our cluster (e.g. `multi-cluster`).

To get the project ID, go to the project dashboard on the google cloud platform and copy the ID under your desired project. It will likely appear somewhat similar to the ID used in the example above.

To get the location, go to the Kubernetes Engine section in the google cloud platform and copy whatever string is in the 'Location' column in the table on the row containing details of your cluster.

The cluster name is displayed in the same table in the 'Name' column.

Be sure to past in the values in place of the example values shown above, but leave the commands otherwise unchanged.

##### Creating secrets in Google Cloud
As I'm sure you remember by this point, earlier in the project we [created a secret](#). We did this by running an imperative command in kubectl.

Now that we're ready to deploy, we need to create that same secret in our Google Cloud environment.

To do this, we first start the CloudShell by clicking the terminal icon in the top right. This allows us to run commands in the same way we would on our local machine. However, before we can run any commands, we must first set up some configuration.

Luckily, we've already written out these commands in our `.travis.yml` file. You can pretty much just copy the three config commands from there:
```
gcloud config set project sublime-habitat-328812
gcloud config set compute/zone europe-west2-a
gcloud container clusters get-credentials multi-cluster
```

These commands must be run whenever you create a new project or a new cluster, but only once. _Phew_.

_Note: the secret password does **not** have to be the same as the password you used in development. In fact, it probably **shouldn't be**._

#### build script
```
deploy:
  provider: script
  script: bash ./deploy.sh
  on:
    branch: main
```

So how come we're using a build script? Simply because travis doesn't have a built in mechanism for deploying code to a kubernetes code. Therefore, we have to write our own custom set of commands, and just tell travis to execute these. The build script we're using is shown below:

```
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
```

##### $GIT_SHA
Why do we use `$GIT_SHA`? Well, not only does it give us a handy way to tag our images with a unique tag each time we deploy, but it also helps us when it comes to debugging. If something was wrong with the deployment, we would know immediately what version of our codebase was being used, since our deployment objects would be using an image tagged with our git commit ID.

### Helm
Helm is a package manager for Kubernetes that allows us to install third party packages _(such as ingress-nginx)_ inside of our Kubernetes clusters. Think of it as an alternitive to the `kubectl apply ...` command we had to use to add `ingress-nginx` to our local cluster. It's very helpful when some of the setup is more challenging.

To install Helm, run the following commands:
```
curl -fsSL -o get_helm.sh https://raw.githubusercontent.com/helm/helm/master/scripts/get-helm-3
chmod 700 get_helm.sh
./get_helm.sh
```

There's more information in the [docs](https://helm.sh/docs/intro/install#from-script). Full helm docs are found [here](https://helm.sh/docs/).

#### Installing ingress-nginx using Helm

### Role Based Access Control (RBAC)
This is a system that limits who can access and modify objects in our cluster. This is usually _not_ enabled by default locally, and _is_ enabled on Google Cloud by default. The following kinds of accounts are defined:

##### User Accounts
This identifies a _person_ administering a cluster
##### Service Accounts
This identifies a _pod_ administering a cluster

Accounts are given permissions by a `RoleBinding`. There are two types of RoleBindings:

##### ClusterRoleBinding
Allows an account to do a certain set of actions across the _entire_ cluster
##### RoleBinding
Allows an account to do a certain set of actions across a _single namespace_.

A _namespace_ is a collection of resources.

## HTTPS Setup
In order to get proper HTTPS certification, we will need to do a few things:

1. Purchase a domain
2. Set up Cert Manager

### Purchasing a domain
Purchasing a domain is fairly straightforward and doesn't _really_ need any explanation. The relevant part to note is that we will be purchasing a domain from [domains.google.com](http://domains.google.com). This is important to note because it __does__ affect the way we set things up.

#### Setting up custom records for our domain
We need to set up two custom records for our domain: one for `<ourdomainname>` and one for `www.<ourdomainname>`.

The setup for this looks something like this:

![custom records](./img/custom-records.png)

### Setting up cert manager
The documentation for cert manager can be found [here](http://cert-manager.readthedocs.io).

To install with helm, we follow the steps described [here](https://cert-manager.io/docs/installation/helm/).

#### Issuer
An object telling Cert Manager how to reach out to a Certificate Authority to obtain a Certificate. The Cetificate Authority we want to reach out to is LetsEncrypt.

The config file for an issuer will look something like the following:
```
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: 'matthewjhcarr@gmail.com'
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
      http01:
        ingress:
          class: nginx
```

##### name
We want to name this with something that makes a reference to the CA we are reaching out to

##### email
LetsEncrypt wants our email for whatever reason, so we add it in here

##### privateKeySecretRef
LetsEncrypt sends us a small private key that is tied to our session. This allows the authentication exchange that verifies us.

##### solvers
This is described [here](https://docs.cert-manager.io/en/latest/tasks/issuers/setup-acme/index.html#creating-a-basic-acme-user)

#### Certificate
An object describing details about the certificate that should be obtained

The config file for our certificate object will look something like the following:
```
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: totalgremlin-com-tls
spec:
  secretName: totalgremlin-com
  issureRef:
    name: letsencrypt-prod
    kind: ClusterIssuer
  commonName: totalgremlin.com
  dnsNames:
    - totalgremlin.com
    - www.totalgremlin.com
```

##### secretName
This tells us where to store the secret associated with the certificate

##### issuerRef
This refers to the properties in our `issuer.yaml` file

##### commonName
This is our domain and the extension. This says that the certificate is good for any page served up with this domain.

##### dnsNames
A list of all the domains that should be associated with the certificate

### Configure ingress-nginx
To configure the ingress-nginx deployment, we need to add the following things to the config file:

#### annotations
```
cert-manager.io/cluster-issuer: 'letsencrypt-prod'
nginx.ingress.kubernetes.io/ssl-redirect: 'true'
```


#### spec
```
spec:
  tls:
    - hosts:
        - totalgremlin.com
        - www.totalgremlin.com
      secretName: totalgremlin-com
```
We should add the above `tls` block right at the start of the `spec` block.

#### Duplicate http block
On the line above `http`, we need to add `- host: <yourdomainname>` and indent the http line by one.  
We then need to copy and paste the entire block, and on the second block rename the host to `www.<yourdomainname>`.

For example:
```
rules:
  - host: totalgremlin.com
    http:
      paths:
        - path: /?(.*)
          pathType: Prefix
          backend:
            service:
              name: client-cluster-ip-service
              port:
                number: 3000
        - path: /api/?(.*)
          pathType: Prefix
          backend:
            service:
              name: server-cluster-ip-service
              port:
                number: 5000
  - host: www.totalgremlin.com
    http:
      paths:
        - path: /?(.*)
          pathType: Prefix
          backend:
            service:
              name: client-cluster-ip-service
              port:
                number: 3000
        - path: /api/?(.*)
          pathType: Prefix
          backend:
            service:
              name: server-cluster-ip-service
              port:
                number: 5000
```