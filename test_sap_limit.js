const SAP_COMPANY_DB = process.env.SAP_COMPANY_DB;
const SAP_USERNAME = process.env.SAP_USERNAME;
const SAP_PASSWORD = process.env.SAP_PASSWORD;
const SAP_API_URL = process.env.SAP_API_URL;

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

async function testFetch() {
    try {
        const loginRes = await fetch(SAP_API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                CompanyDB: SAP_COMPANY_DB,
                UserName: SAP_USERNAME,
                Password: SAP_PASSWORD,
            }),
        });

        const loginData = await loginRes.json();
        const sessionId = loginData.SessionId;

        const itemsUrl = SAP_API_URL.replace("/Login", "/Items?$top=100&$select=ItemCode,ItemName");
        console.log("Fetching", itemsUrl);

        const itemsRes = await fetch(itemsUrl, {
            method: "GET",
            headers: {
                "Cookie": `B1SESSION=${sessionId}; ROUTEID=.node0`,
            }
        });

        const itemsData = await itemsRes.json();
        console.log("Returned items count:", itemsData.value.length);
        console.log("Has nextLink?", !!itemsData['odata.nextLink'] || !!itemsData['@odata.nextLink']);

    } catch (e) {
        console.error(e);
    }
}
testFetch();
