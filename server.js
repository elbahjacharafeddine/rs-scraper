const express = require('express');
const cors = require("cors");
const dotenv = require("dotenv");
dotenv.config();
const puppeteer = require('puppeteer')

const app = express();
const WebSocket = require('ws');


const Sentry = require('@sentry/node');
Sentry.init({ dsn: 'https://80a12083a1774420b431700d1d2cf56f@o433230.ingest.sentry.io/5387943' });
// The request handler must be the first middleware on the app
app.use(Sentry.Handlers.requestHandler());
app.use(express.json());
app.use(cors());


app.use("/screenshots", express.static(__dirname + "/public/screenshots"));

const router = require("./routes");
const {log} = require("debug");
const http = require("http");
app.use("/", router);
// The error handler must be before any other error middleware and after all controllers
app.use(Sentry.Handlers.errorHandler());

// app.listen(process.env.PORT || 2000, () =>
//   console.log("Server http started on port :", process.env.PORT || 2000)
// );

app.get("/test",(req, res) =>{
    res.send('server for web web scraping is running ...')
})


let browser;

// Function to launch the Puppeteer browser if not already launched.
async function getBrowser() {
    browser = await puppeteer.launch({
        headless: true,
        userDataDir: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    return browser;
}

async function goToErressource(page) {
    await page.goto('https://eressources.imist.ma/login');
    await page.type('#email', 'e-elbahja.c@ucd.ma');
    await page.type('#password', 'LEv.q8XeGxP2Pid');
    await Promise.all([
        page.waitForNavigation(), // Wait for the navigation to complete after clicking the login button.
        page.click('button[type="submit"]'),
    ]);
    console.log("Authentication with success ... ");
}

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let res ={
    step:'Recherchons dans la base ',
    plateforme :"SCOPUS",
    color:'white',
    background:'orange'
}
const response ={res:res}
wss.on('connection', async (ws) => {
    console.log('WebSocket connection established');

    ws.on('message', async (message) => {
        const data = JSON.parse(message);
        if(data.authorId){
            console.log(`Received ID: ${data.authorId}`)
            const authorId = data.authorId
            try {
                const browser = await getBrowser();
                const page = await browser.newPage();
                // Définir l'en-tête User-Agent personnalisé
                await page.setUserAgent('Chrome/96.0.4664.93');
                await page.setDefaultNavigationTimeout(85000);
                // await page.waitForFunction(() => document.readyState === 'complete');
                const navigationPromise = page.waitForNavigation({ waitUntil: 'domcontentloaded' });
                await goToErressource(page)
                ws.send(JSON.stringify(response))
                await page.goto('https://www-scopus-com.eressources.imist.ma/authid/detail.uri?authorId=' + authorId);
                await navigationPromise; // Wait for the DOM content to be fully loaded
                console.log('navigation to scopus...')

                await page.waitForTimeout(1500)
               // await page.waitForSelector('#scopus-author-profile-page-control-microui__general-information-content', {timeout: 4000});

                const name = await page.$eval('#scopus-author-profile-page-control-microui__general-information-content > div.Col-module__hwM1N.offset-lg-2 > div > h1 > strong', (e) => e.textContent.trim().replace(',', ''))
                let univer=''
                try {
                    univer = await page.$eval('#scopus-author-profile-page-control-microui__general-information-content > div.Col-module__hwM1N.offset-lg-2 > ul > li.AuthorHeader-module__DRxsE > span > a > span.Typography-module__lVnit.Typography-module__Nfgvc.Button-module__Imdmt', (e) => e.textContent.trim())
                }catch (e) {
                    console.log('university not found ...')
                }
                let h_index = ''
                try {
                    h_index = await page.$eval("#scopus-author-profile-page-control-microui__general-information-content > div.Col-module__hwM1N.offset-lg-2 > section > div > div:nth-child(3) > div > div > div:nth-child(1) > span.Typography-module__lVnit.Typography-module__ix7bs.Typography-module__Nfgvc", (e) => e.textContent)
                } catch (error) {
                    console.log("")
                }
                const interests = []

                console.log('start scrolling...')
                await autoScroll(page);
                console.log('End of scrolling...')

                let publicationss = []
                let publications =[]
                const allPath = await page.evaluate(() => Array.from(document.querySelectorAll('path[aria-label]'), (e) => e.getAttribute('aria-label')));
                const citationsPerYear = allPath.map(item => {
                    const [yearString, citationsString] = item.split(':');
                    const year = parseInt(yearString.trim());
                    const citations = parseInt(citationsString.trim());

                    return {year, citations};
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

                console.log("good elbahja")
                const authorr ={
                    name,
                    profilePicture: "",
                    univer,
                    email: "",
                    indexes,
                    interests,
                    publications,
                    coauthors: [],
                    citationsPerYear,
                };
                const author = {"author": {authorId, platform: "scopus", ...authorr}}

                async function extractPublicationDetails(element) {
                    const publication = await element.evaluate((e) => {
                        return {
                            title: e.querySelector('h4 span').innerText,
                            authors: Array.from(new Set(Array.from(e.querySelectorAll('.author-list span'), (authorElement) => authorElement.innerText))),
                            citation: e.querySelector('.col-3 span:nth-child(1)').innerText,
                            year: e.querySelector('.text-meta span:nth-child(2)').innerText.replace('this link is disabled', '').substring(0, 4),
                            source: e.querySelector('span.text-bold').innerText,
                        };
                    });

                        publications.push(publication);

                        await ws.send(JSON.stringify(author));
                    await new Promise(resolve => setTimeout(resolve, 3000));
                }



                await page.waitForSelector('.ViewType-module__tdc9K li');
                const elements = await page.$$('.ViewType-module__tdc9K li');
                for (const element of elements) {
                    await extractPublicationDetails(element);
                }

                const paginationLink = await page.$$('.micro-ui-namespace els-paginator li');
                paginationLink.shift()
                paginationLink.shift()
                paginationLink.pop()

                for(const e of paginationLink){
                    console.log("element is clicked ...!")
                    await e.click()
                    await page.waitForTimeout(1500)

                    await page.waitForSelector('.ViewType-module__tdc9K li');
                    const elements = await page.$$('.ViewType-module__tdc9K li');
                    for (const element of elements) {
                        await extractPublicationDetails(element);
                    }
                }
                let pages = await browser.pages();
                await Promise.all(pages.map(page =>page.close()));
                await browser.close();
                console.log("the response has been sent")
                const fin = {
                    fin :true,
                }
                ws.send(JSON.stringify(fin))

            } catch (error) {
                console.log("************  erreur  ************")
                const message ={state:"erreur"}
                console.log(error)
                ws.send(JSON.stringify(message))
                let pages = await browser.pages();
                await Promise.all(pages.map(page =>page.close()));
                await browser.close();
                const fin = {
                    fin :false,
                }
                ws.send(JSON.stringify(fin))
            }
        }

        else if(data.journalName && data.year) {
            try {
                console.log(`journal name: ${data.journalName} and year ${data.year}`);
                const browser = await getBrowser();
                const page = await browser.newPage();
                await page.setUserAgent('Chrome/96.0.4664.93');
                await page.setDefaultNavigationTimeout(85000);
                // await page.waitForFunction(() => document.readyState === 'complete');
                const navigationPromise = page.waitForNavigation({ waitUntil: 'domcontentloaded' });
                await page.goto('https://www.scimagojr.com/journalsearch.php?q=' + data.journalName)
                await navigationPromise;
                const firstLink = await page.evaluate(() => {
                    const linkElement = document.querySelector('.journaldescription .search_results a');
                    return linkElement ? linkElement.getAttribute('href') : null;
                });


                page.goto('https://www.scimagojr.com/'+firstLink)
                await page.waitForNavigation({ waitUntil: 'domcontentloaded' });
                page.waitForTimeout(1000)
                const scrollPercentage = 40; // Réglez la valeur du pourcentage ici
                await autoScrollToPercentage(page, scrollPercentage);
                await page.waitForTimeout(3000);

                const selector = 'body > div.dashboard > div.cell1x1.dynamiccell > div.cellheader > div.combo_buttons > div.combo_button.table_button > img'
                await page.waitForSelector(selector);
                await page.click(selector);

                await page.waitForTimeout(1000)

                const datta = await page.evaluate(() => {
                    const tableRows = Array.from(document.querySelectorAll('.dashboard .cellcontent table tbody tr'));
                    const rowData = tableRows.map(row => {
                        const [yearCell, sjrCell] = row.querySelectorAll('td');
                        return {
                            year: yearCell.textContent.trim(),
                            sjr: sjrCell.textContent.trim(),
                        };
                    });
                    return rowData;
                });
                let sjr="-"
                for (const item of datta) {
                    if (item.year === data.year) {
                        sjr = item.sjr;
                        break;
                    }
                }
                const journal= {
                    SJR: sjr,
                }
                ws.send(JSON.stringify( journal))
                console.log("value of SJR has sent with success ...")
            }catch (e) {
                const sjr = '-'
                console.log('error for searching article'+e)
                const journal= {
                    SJR: sjr,
                }
                ws.send(JSON.stringify( journal))
            }
            let pages = await browser.pages();
            await Promise.all(pages.map(page =>page.close()));
            await browser.close();
        }

        else {
            const message ={state:"erreur"}
            ws.send(JSON.stringify(message))
            let pages = await browser.pages();
            await Promise.all(pages.map(page =>page.close()));
            await browser.close();
        }
    });


    ws.on('close', () => {
        console.log('WebSocket connection closed');
    });
});

const port = 2000
server.listen(port, () => {
    console.log(`Server started on http://localhost:${port}`);
});

app.get('/auth/scopus/:authorId',async (req, res) =>{
    const {authorId} = req.params
    try {
        const browser = await getBrowser();
        const page = await browser.newPage();
        // Définir l'en-tête User-Agent personnalisé
        await page.setUserAgent('Chrome/96.0.4664.93');
        await page.setDefaultNavigationTimeout(85000);
        // await page.waitForFunction(() => document.readyState === 'complete');
        // const navigationPromise = page.waitForNavigation({ waitUntil: 'domcontentloaded' });
        await goToErressource(page)


        await page.goto('https://www-scopus-com.eressources.imist.ma/authid/detail.uri?authorId=' + authorId);
        // await navigationPromise; // Wait for the DOM content to be fully loaded

        console.log('navigation to scopus...')
        // await browser.close();
        await page.waitForTimeout(1500);
        console.log('start scrolling...')
        await autoScroll(page);
        console.log('End of scrolling...')

        await page.waitForSelector('#scopus-author-profile-page-control-microui__general-information-content',{timeout:4000});

        // await page.waitForSelector('.container .AuthorProfilePageControl-module__sgqt5',{ timeout: 70000 })

        const name = await page.$eval('#scopus-author-profile-page-control-microui_general-information-content > div.Col-module_hwM1N.offset-lg-2 > div > h1 > strong', (e) => e.textContent.trim().replace(',',''))
        // await page.waitForSelector('#scopus-author-profile-page-control-microui__general-information-content')
        const univer = await page.$eval('#scopus-author-profile-page-control-microui_general-information-content > div.Col-modulehwM1N.offset-lg-2 > ul > li.AuthorHeader-moduleDRxsE > span > a > span.Typography-modulelVnit.Typography-moduleNfgvc.Button-module_Imdmt', (e) => e.textContent.trim())
        let h_index=''
        try {
            h_index = await page.$eval("#scopus-author-profile-page-control-microui_general-information-content > div.Col-modulehwM1N.offset-lg-2 > section > div > div:nth-child(3) > div > div > div:nth-child(1) > span.Typography-modulelVnit.Typography-moduleix7bs.Typography-module_Nfgvc",(e) =>e.textContent)
        }catch (error){
            console.log("")
        }
        const interests = []

        // // await page.waitForTimeout(1000);
        // console.log("time out started...")
        // // await page.waitForTimeout(1000);
        // console.log("time out finished...")
        await page.waitForSelector('#documents-panel > div > div.Columns-module__FxWfo > div:nth-child(2) > div > els-results-layout > els-paginator > nav > els-select > div > label > select');
        console.log('select item for pagination...')
        await page.select("#documents-panel > div > div.Columns-module__FxWfo > div:nth-child(2) > div > els-results-layout > els-paginator > nav > els-select > div > label > select", "200")
        console.log('set value in item...')
        // await page.waitForTimeout(1000);

        console.log('start scrolling...')
        await autoScroll(page);
        console.log('End of scrolling...')

        await page.waitForTimeout(500);
        const publications = await page.evaluate(() =>
            Array.from(document.querySelectorAll('.ViewType-module__tdc9K li'), (e) => ({
                title:e.querySelector('h4 span').innerText,
                authors: Array.from((new Set(Array.from(e.querySelectorAll('.author-list span'), (authorElement) => authorElement.innerText)))),
                citation : e.querySelector('.col-3 span:nth-child(1)').innerText,
                year:e.querySelector('.text-meta span:nth-child(2)').innerText.replace('this link is disabled',"").substring(0,4),
                source:e.querySelector('span.text-bold').innerText,
            })));

        const allPath = await page.evaluate(() => Array.from(document.querySelectorAll('path[aria-label]'), (e) => e.getAttribute('aria-label')));
        await browser.close();

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
        };

        res.send({ "author": { authorId, platform: "scopus", ...author } });
        console.log("the response has been sent")


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


async function autoScrollToPercentage(page, percentage) {
    if (percentage <= 0 || percentage >= 100) {
        throw new Error('Percentage value should be between 0 and 100');
    }

    await page.evaluate(async (targetPercentage) => {
        await new Promise((resolve) => {
            const targetScrollHeight = Math.floor((targetPercentage / 100) * document.body.scrollHeight);
            let currentScrollHeight = 0;
            const distance = 200;

            const timer = setInterval(() => {
                const scrollHeight = document.body.scrollHeight;
                window.scrollBy(0, distance);
                currentScrollHeight += distance;

                if (currentScrollHeight >= targetScrollHeight || currentScrollHeight >= scrollHeight - window.innerHeight) {
                    clearInterval(timer);
                    resolve();
                }
            }, 100);
        });
    }, percentage);
}



