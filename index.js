   // Define the MongoDB client outside the function handler
   const { MongoClient } = require('mongodb');
   let client = null;
   let isConnecting = false;

   module.exports = async function (context, myTimer) {
       const timeStamp = new Date().toISOString();
       context.log('JavaScript timer trigger function ran!', timeStamp);
       
       try {
           // Get environment variables
           const instagramBusinessId = process.env.INSTAGRAM_BUSINESS_ID;
           const instagramAccessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
           const mongodbUri = process.env.MONGODB_ATLAS_URI;
           
           if (!instagramBusinessId || !instagramAccessToken || !mongodbUri) {
               throw new Error('Required environment variables are not set');
           }
           
           // Use built-in https module
           const https = require('https');
           
           // Function to make HTTPS requests
           const makeRequest = (url) => {
               return new Promise((resolve, reject) => {
                   https.get(url, (res) => {
                       let data = '';
                       
                       res.on('data', (chunk) => {
                           data += chunk;
                       });
                       
                       res.on('end', () => {
                           if (res.statusCode >= 200 && res.statusCode < 300) {
                               try {
                                   resolve(JSON.parse(data));
                               } catch (e) {
                                   reject(new Error('Failed to parse response: ' + e.message));
                               }
                           } else {
                               reject(new Error(`Request failed with status code ${res.statusCode}`));
                           }
                       });
                   }).on('error', (e) => {
                       reject(e);
                   });
               });
           };
           
           // Fetch Instagram data
           context.log('Fetching Instagram data...');
           const url = `https://graph.facebook.com/v18.0/${instagramBusinessId}?fields=followers_count&access_token=${instagramAccessToken}`;
           const instagramData = await makeRequest(url);
           
           context.log('Instagram API response:', JSON.stringify(instagramData));
           
           if (!instagramData.followers_count) {
               throw new Error('No followers_count in Instagram API response');
           }
           
           // Create follower count record
           const followerRecord = {
               followerCount: instagramData.followers_count,
               timestamp: new Date(),
               isPostMeasurement: false
           };
           
           context.log('Follower count retrieved:', instagramData.followers_count);
           
           // Try to connect to MongoDB
           try {
               // Initialize MongoDB client if not already done
               if (!client) {
                   context.log('Creating new MongoDB client');
                   // Set maxIdleTimeMS to 60000 (1 minute) as recommended
                   client = new MongoClient(mongodbUri, {
                       useNewUrlParser: true,
                       useUnifiedTopology: true,
                       maxIdleTimeMS: 60000
                   });
               }
               
               // Connect if not already connected
               if (!client.isConnected && !isConnecting) {
                   isConnecting = true;
                   context.log('Connecting to MongoDB Atlas...');
                   await client.connect();
                   isConnecting = false;
                   context.log('Connected to MongoDB Atlas');
               }
               
               // Insert the follower record
               const database = client.db('instagram-analytics');
               const collection = database.collection('followerCounts');
               const result = await collection.insertOne(followerRecord);
               context.log(`Inserted document with _id: ${result.insertedId}`);
               
               // Note: We don't close the connection here to reuse it in future invocations
               
           } catch (mongoError) {
               context.log.error('MongoDB error:', mongoError.message);
               if (mongoError.stack) {
                   context.log.error('MongoDB error stack:', mongoError.stack);
               }
               // Continue execution even if MongoDB fails
           }
           
           // Return success
           context.log('Function completed successfully');
           
       } catch (error) {
           context.log.error('Error in function execution:', error.message);
           if (error.stack) {
               context.log.error('Stack trace:', error.stack);
           }
           throw error;
       }
   };
