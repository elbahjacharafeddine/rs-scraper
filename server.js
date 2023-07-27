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
        await page.setUserAgent('Chrome/96.0.4664.93');
        await page.setDefaultNavigationTimeout(70000);

        const navigationPromise = page.waitForNavigation({ waitUntil: 'domcontentloaded' });
        await page.goto('https://www.scopus.com/authid/detail.uri?authorId=' + authorId);
        await navigationPromise; // Wait for the DOM content to be fully loaded

        await page.waitForSelector('#scopus-author-profile-page-control-microui__general-information-content');

        // await page.waitForSelector('.container .AuthorProfilePageControl-module__sgqt5',{ timeout: 70000 })

        const name = await page.$eval('#scopus-author-profile-page-control-microui__general-information-content > div.Col-module__hwM1N.offset-lg-2 > div > h1 > strong', (e) => e.textContent.trim().replace(',',''))
        // await page.waitForSelector('#scopus-author-profile-page-control-microui__general-information-content')
        const univer = await page.$eval('#scopus-author-profile-page-control-microui__general-information-content > div.Col-module__hwM1N.offset-lg-2 > ul > li.AuthorHeader-module__DRxsE > span > a > span.Typography-module__lVnit.Typography-module__Nfgvc.Button-module__Imdmt', (e) => e.textContent.trim())
        const h_index = await page.$eval("#scopus-author-profile-page-control-microui__general-information-content > div.Col-module__hwM1N.offset-lg-2 > section > div > div:nth-child(3) > div > div > div:nth-child(1) > span.Typography-module__lVnit.Typography-module__ix7bs.Typography-module__Nfgvc",(e) =>e.textContent)
        const interests = []

        // await page.waitForTimeout(1000);
        await autoScroll(page);

        console.log("time out started")
        await page.waitForTimeout(1000);
        console.log("time out finished")

        const publications = await page.evaluate(() =>
            Array.from(document.querySelectorAll('.ViewType-module__tdc9K li'), (e) => ({
                title:e.querySelector('h4 span').innerText,
                authors: Array.from((new Set(Array.from(e.querySelectorAll('.author-list span'), (authorElement) => authorElement.innerText)))),
                citation : e.querySelector('.col-3 span:nth-child(1)').innerText,
                year:e.querySelector('.text-meta span:nth-child(2)').innerText.replace('this link is disabled',"").substring(0,4),
                source:e.querySelector('span.text-bold').innerText,
            })));
        // await page.waitForTimeout(1000);

        const allPath = await page.evaluate(() => Array.from(document.querySelectorAll('path[aria-label]'), (e) => e.getAttribute('aria-label')));


        const citationsPerYear = allPath.map(item => {
            const [yearString, citationsString] = item.split(':');
            const year = parseInt(yearString.trim());
            const citations = parseInt(citationsString.trim());

            return { year, citations };
        });
        const totalCitations = citationsPerYear.reduce((acc, item) => acc + item.citations, 0);
        const indexes = [
            {
                name: "citations",
                total: totalCitations,
                lastFiveYears: "",
            },
            {
                name: "h-index",
                total: h_index,
                lastFiveYears: "",
            },
        ];

        // await page.waitForTimeout(1000);


        const author ={
            name,
            profilePicture: "",
            univer,
            email: "",
            indexes,
            interests,
            publications,
            coauthors: [],
            citationsPerYear,
            // listItem,
            // liElement,
        };

        res.send({ "author": { authorId, platform: "scopus", ...author } });

        // Fermer le navigateur
        await browser.close();
        // return res.send({ univer })
    } catch (error) {
        console.error('Une erreur s\'est produite :', error);
    }
})


async function autoScroll(page){
    await page.evaluate(async () => {
        await new Promise((resolve) => {
            let totalHeight = 0;
            const distance = 100;
            const timer = setInterval(() => {
                const scrollHeight = document.body.scrollHeight;
                window.scrollBy(0, distance);
                totalHeight += distance;

                if (totalHeight >= scrollHeight - window.innerHeight) {
                    clearInterval(timer);
                    resolve();
                }
            }, 100);
        });
    });
}
