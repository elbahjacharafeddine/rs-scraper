const express = require('express');
const cors = require("cors");
const dotenv = require("dotenv");
dotenv.config();
const puppeteer = require('puppeteer')

const app = express();

const Sentry = require('@sentry/node');
Sentry.init({ dsn: 'https://80a12083a1774420b431700d1d2cf56f@o433230.ingest.sentry.io/5387943' });
// The request handler must be the first middleware on the app
app.use(Sentry.Handlers.requestHandler());
app.use(express.json());
app.use(cors());


app.use("/screenshots", express.static(__dirname + "/public/screenshots"));

const router = require("./routes");
app.use("/", router);
// The error handler must be before any other error middleware and after all controllers
app.use(Sentry.Handlers.errorHandler());

app.listen(process.env.PORT || 2000, () =>
  console.log("Server started on port :", process.env.PORT || 2000)
);
app.get("/test",(req, res) =>{
    res.send('server for web web scraping is running ...')
})

app.get('/auth/scopus/:authorId',async (req, res) =>{
    const {authorId} = req.params
    try {
        const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'] // Ajoutez d'autres arguments au besoin
        });
        const page = await browser.newPage();
        // Définir l'en-tête User-Agent personnalisé
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.93 Safari/537.36');
        await page.setDefaultNavigationTimeout(60000);
        await page.goto('https://www.scopus.com/authid/detail.uri?authorId='+authorId);


        await page.waitForSelector('#scopus-author-profile-page-control-microui__general-information-content');
        const name = await page.$eval('#scopus-author-profile-page-control-microui__general-information-content > div.Col-module__hwM1N.offset-lg-2 > div > h1 > strong', (e) => e.textContent.trim())


        // await page.waitForSelector('#scopus-author-profile-page-control-microui__general-information-content')
        const univer = await page.$eval('#scopus-author-profile-page-control-microui__general-information-content > div.Col-module__hwM1N.offset-lg-2 > ul > li.AuthorHeader-module__DRxsE > span > a > span.Typography-module__lVnit.Typography-module__Nfgvc.Button-module__Imdmt', (e) => e.textContent.trim())
        const interests = []
        const citationsPerYear = [];

        const author ={
            name,
            profilePicture: "",
            univer,
            email: "",
            // indexes,
            interests,
            // publications,
            coauthors: [],
            citationsPerYear,
        };

        res.send({ "author": { authorId, platform: "scopus", ...author } });


        await browser.close();
        // Fermer le navigateur
        await browser.close();
        // return res.send({ univer })
    } catch (error) {
        console.error('Une erreur s\'est produite :', error);
    }
})
