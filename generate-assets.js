require('dotenv').config();
const {
  createWriteStream,
  exists,
  mkdir,
  readdir,
  readFile
} = require('fs');
const got = require('got');
const async = require('async');
const { promisify } = require('util');
const { pipeline } = require('stream');
const cloudinary = require('cloudinary').v2;

const pipelineAsync = promisify(pipeline);
const existsAsync = promisify(exists);
const mkdirAsync = promisify(mkdir);
const readdirAsync = promisify(readdir);
const readFileAsync = promisify(readFile);

const {
  CLOUD_NAME,
  API_KEY,
  API_SECRET
} = process.env;

cloudinary.config({
  cloud_name: CLOUD_NAME,
  api_key: API_KEY,
  api_secret: API_SECRET
});

const tags = [
  'birds',
  'insects',
  'locations',
  'reptiles',
  'amphibians'
];

const createDirectory = async (name) => !await existsAsync(name) && mkdirAsync(name)

async.waterfall([
  function (cb) {
    (async () => {
      try {
        const directory = 'json';

        await createDirectory(directory);

        for await (let tag of tags) {
          await pipelineAsync(
            got.stream(cloudinary.url(`${tag}.json`, { type: 'list', sign_url: true })),
            createWriteStream(`${directory}/${tag}.json`),
          );
        }
        cb(null, directory);
      } catch(e) {
        console.log(e);
      }
    })();
  },
  function (directory, cb) {
    (async () => {
      const files = await readdirAsync(directory);
      const sources = { 'category': [], data: [] };
      const sizes = {
        large: { w: 1024, q: 100 },
        medium: {w: 640, q: 100 },
        small: {w: 320, q: 100 }
      };

      for await (let file of files) {
        const { resources } = JSON.parse(await readFileAsync(`./${directory}/${file}`, 'utf8'));

        resources.forEach(({ public_id, format, version, type }) => {
          const o = {};
          const regEx = /(?:.*Photos\/\w*\/)(\w*)(?:.*)/i;
          const category = public_id.match(regEx)[1];

          o.large = {
            src: `https://res.cloudinary.com/avjpl/image/${type}/f_auto,q_${sizes.large.q},w_${sizes.large.w}/v${version}/${public_id}.${format}`,
            width: sizes.large.w,
            category,
          };
          o.medium = {
            src: `https://res.cloudinary.com/avjpl/image/${type}/f_auto,q_${sizes.medium.q},w_${sizes.medium.w}/v${version}/${public_id}.${format}`,
            width: sizes.medium.w,
            category,
          };
          o.small = {
            src: `https://res.cloudinary.com/avjpl/image/${type}/f_auto,q_${sizes.small.q},w_${sizes.small.w}/v${version}/${public_id}.${format}`,
            width: sizes.small.w,
            category,
          };

          if (!sources.category.includes(category)) {
            sources.category = [...sources.category, category];
          }
          sources.data = [...sources.data, o];
        });
      }

      cb(null, sources, 'assets');
    })();
  },
  function (sources, directory, cb) {
    (async () => {
      createDirectory(directory);

      await createWriteStream(`${directory}/assets.json`)
        .write(JSON.stringify(sources, null, '\t'));
      cb('generated asstes.json');
    })();
  }
], function (err, result) {
  if (err) console.error(err);
});
