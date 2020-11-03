/* Telegram MHW Crown Bot */
/*request and recieve information via Telegram about currently 
obtained miniature/large crowns in MHW and MHW:Iceborne

Using:
Telegram Bot for sending and recieving information
Google Sheets for storing information
Google Web App / Google Script for handling information and requests*/

/* GLOBAL VARIABLES */
// Telegram Bot Token, aquired by registering a new bot via @botfather in Telegram
const TOKEN = "";

// Base URL for sending Requests
const BASE_URL = "https://api.telegram.org/bot" + TOKEN;

// URL of the Google Script Sheet, obtained by publishing the script as a Web App. Telegram Webhook needs to be set to this.
const WEB_APP_URL = "";

// ID of the google Sheet containing the information
const SHEET_ID = "";

// ID of admin/creator telegram account for test purposes
 const ADMIN_ID = 0;

// list of users that are allowed to make changes
const ALLOWED_USERS = []

/* SPREADSHEET KEY DATA
keep those up to date, as they determine how many rows the program iterates to find all monsters/quests 
COUNT variables contain +1 for their header rows */
const COLUMNS = 13;
const MONSTER_COUNT = 72 + 1;
const QUEST_COUNT = 11 + 1;
const TOTAL_ROWS = MONSTER_COUNT + QUEST_COUNT;

/* Emoji codes (javascript escaped unicode versions) */
const EMOJI_CHECK = "\u2705";
const EMOJI_RED = "\ud83d\udd34";
const EMOJI_HOLLOW_RED = "\u2b55";

/* monster and quest sheet data. refreshed on every POST request */
var monster_data;

var quest_data;

/////////////// CODE //////////////////

//////* API HELPER FUNCTIONS */////////

function getMe() {
    var response = UrlFetchApp.fetch(BASE_URL + "/getMe");
}

function doGet(e) {
    return HtmlService.createHtmlOutput("Hello" + JSON.stringify(e));
}

function getUpdates() {
    var response = UrlFetchApp.fetch(BASE_URL + "/getUpdates");
}

function setWebhook() {
    var response = UrlFetchApp.fetch(BASE_URL + "/setWebHook?url=" + WEB_APP_URL);
}

function sendMessage(id, text) {
    var response = UrlFetchApp.fetch(BASE_URL + "/sendMessage?chat_id=" + id + "&text=" + encodeURI(text));
}

//////* MAIN REQUEST HANDLER *//////
// this is where telegram works. each message to the bot is a POST-request, handled in this function
function doPost(e) {

    var contents = JSON.parse(e.postData.contents);

    var text = contents.message.text;
    var user_id = contents.message.from.id;

    // refresh the global data
    // global data contains an array for the monsters and another for the quests spreadsheet
    refreshGlobalData();

    try {
        // test if message is command (starts with "/")
        if (/^\//.test(text)) {
            commandHandler(user_id, text);
            // if message is no command -> search for single Monster/Quest
        } else {
            sendEntryStateAsMessage(user_id, text);
        }
    } catch (e) {
        sendMessage(user_id, "ERROR. Feel free to contact an admin to get this fixed.\n" + e);
    }
}

/////////* BOT FUNCTIONS */////////

// handle commands. id needed to send messages and authorize user on /setValue
function commandHandler(id, text) {

    var args = text.split(' ');
    var command = args.shift();

    switch (command.toLowerCase()) {
        case "/start":
            displayHelp(id);
            break;
        case "/help":
            displayHelp(id);
            break;
        case "/crown":
            setValues(id, text, args);
            break;
        case "/listall":
            sendMessage(id, getHeaders(global_monster_data).concat(getHeaders(global_quest_data)).join("\n"));
            break;
        default:
            sendMessage(id, "command not found. try /help.");
            break;
    }
}

// display help message (user sends /help)
function displayHelp(id) {
    let help_text = "Hi! You're either new here or requested help with the dreiernasenBot.\
                \n\nAvailable commands are:\
                \n1) <Name of Monster or Quest> to display the current state for a single monster or crown quest\
                \n2) '/listAll' to list all monsters and quests in the database\
                \n3) '/crown <monster> <user1L>,<user2S>' to set a crown for listed users. No whitespaces between users - use comma!\
                \n4) '/help' to display this message again\
                \n\nWARN: Quest information does not yet update automatically after you used /crown.";
    sendMessage(id, help_text);
}

// find monster data in spreadsheet and return formatted data as array
function findItem(id, item) {

    var item_result = null;

    if (getHeaders(global_monster_data).includes(String(item).toLowerCase())) {

        item_result = getMonsterData(id, item, "all");

    } else if (getHeaders(global_quest_data).includes(String(item).toLowerCase())) {

        item_result = getQuestData(id, item);

    } else {
        sendNotFoundMessage(id, item);
    }

    return item_result;
}


// set values for cells, used for setting users new crown possessions. (e.g. set that user1 found large Teostra crown) 
function setValues(id, text, args) {

    if (!isUserAuthorized(id, text, args)) {
        return;
    }

    // handle (wrong) user input
    if (args.length > 4) {
        sendMessage(id, "error. too many arguments provided. remember: no whitespaces between users (=> userL,user2L)!\n\ncheck usage via /help");
        return;
    } else if (args.length <= 1) {
        sendMessage(id, "error. not enough arguments provided. You need a <monster> and at least one <user>!\n\ncheck usage via /help");
        return;
    }

    var raw_user_data = String(args.pop());

    var monster_name = args.join(' ');

    // search for the spreadsheet row the monsters data is in. +1 because sheet starts at 1, not at 0
    var monster_row = getRowNumberByValue(id, global_monster_data, monster_name);

    var matched_user_columns = getMatchedUserColumns(id, raw_user_data);

    if (!matched_user_columns || !monster_row) {
        return;
    }

    matched_user_columns.forEach(column => changeCellValue(id, column, monster_row));

    // refresh global data
    global_monster_data = getMonstersSheetAsArray();

    sendMessage(id, EMOJI_CHECK + "check! New state of " + monster_name + ":");

    sendEntryStateAsMessage(id, monster_name);
}


function getMonsterData(id, monster, mode = "all") {
    let matching_monster_row = getRowNumberByValue(id, global_monster_data, monster);
    let raw_data = global_monster_data[matching_monster_row].slice(0, 3);

    var answer_array = [];

    if (raw_data[0] == "Fluffeluff") {
        answer_array.push(raw_data[1]);
        answer_array.push("Es kosst dich: " + raw_data[2]);
        return answer_array;
    }

    if (raw_data[1] == "Yes") {
        answer_array.push(EMOJI_RED + "Not done");
        if (mode == "all") {
            answer_array.push(EMOJI_HOLLOW_RED + raw_data[2]);
        }
    } else if (raw_data[1] == "No") {
        answer_array.push(EMOJI_CHECK + "Done");
    }

    return answer_array;
}


function getQuestData(id, quest) {
    let matching_row = getRowNumberByValue(id, global_quest_data, quest);
    let raw_data = global_quest_data[matching_row];

    var answer_array = [];

    if (raw_data[1] == "NO") {
        answer_array.push(EMOJI_CHECK + "Done");
        return answer_array;
    }

    answer_array.push("Rank: " + raw_data[2] + "\n");

    for (let i = 3; i <= raw_data.length; i += 2) {
        if (raw_data[i]) {
            if (raw_data[i + 1] == '') {
                answer_array.push(EMOJI_CHECK + raw_data[i]);
            } else {
                answer_array.push(EMOJI_RED + raw_data[i])
                answer_array.push(EMOJI_HOLLOW_RED + raw_data[i + 1]);
            }
        }
    }

    return answer_array;
}


// send user a message w/ approximate matches (matching 1st char) to search query
function sendNotFoundMessage(id, entry) {
    let all_headers = getHeaders(global_monster_data).concat(getHeaders(global_quest_data));

    // TODO make function and make clickable
    let approx_match = all_headers.filter(item => String(item).toLowerCase().startsWith(entry.substring(0, 1).toLowerCase()));

    let match_list = approx_match.join('\n');

    let txt = "The monster or quest you were looking for has not been found. Check your spelling - I guess you're looking for one of those?\n\n" + match_list + "\n\nYou can send me a '/listAll' for a list of all monsters in the database";

    sendMessage(id, txt);
}

// Helper function to 
function getMatchedUserColumns(id, string) {

    //split into single user names
    var data = string.split(',');

    // make them unique (Set) and clear special characters
    var users = [...new Set(data.map(x => cleanString(x)))];

    var matched_user_columns = [];

    users.forEach(user => {
        let container = getColumnByValue(id, user);

        if (container != null) {
            matched_user_columns.push(container);
        }
    })
    return matched_user_columns.length != 0 ? matched_user_columns : null
}

// check if users ID is authorized
function isUserAuthorized(id, text, args) {
    // check if user is authorized, send message and quit function if not.
    if (!ALLOWED_USERS.includes(id)) {
        sendMessage(id, "Error.\nHello, friend. Your ID is not allowed to make changes to the database. Contact the bots admin if you think you should be able to do that.");
        return false;
    } else {
        return true;
    }
}

//////* HELPER FUNCTIONS *///////

// return the main "data" sheet as array 
function getMonstersSheetAsArray() {
    var sheet = SpreadsheetApp.openById(SHEET_ID);

    return sheet.getSheetByName("monsters").getDataRange().getValues();
}

// return the main "data" sheet as array 
function getQuestsSheetAsArray() {
    let sheet = SpreadsheetApp.openById(SHEET_ID);

    return sheet.getSheetByName("quests").getDataRange().getValues();
}

function refreshGlobalData() {
    global_monster_data = getQuestsSheetAsArray(); 
    global_quest_data = getMonstersSheetAsArray();
}


// match two entries, compare them case insensitive as strings
function entriesMatch(entry_1, entry_2) {
    if (String(entry_1).toLowerCase() === String(entry_2).toLowerCase()) {
        return true;
    } else {
        return false;
    }
}

// remove all chars but letters and whitespaces from string
function cleanString(string) {
    return string.replace(/[^a-zA-Z ]/g, '');
}

// look for a certain monster and send formatted message
function sendEntryStateAsMessage(id, item) {
    var item_data = findItem(id, item);
    if (item_data != null) {
        sendMessage(id, item_data.join("\n"));
    }
}

// list all monsters or quests in spreadsheet, table is one of the global arrays
function getHeaders(table) {
    let result_array = [];

    for (let i = 1; i < table.length; i++) {
        result_array.push(String(table[i][0]).toLowerCase());
        //Logger.log("getHeaders(" + table + ") Nr.:" + i + " " + table[i]);
    }
    return result_array;
}

// returns alphabetical letter for the column the value has been found in
function getColumnByValue(id, value) {
    let ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

    for (let i = 0; i <= COLUMNS; i++) {

        if (entriesMatch(global_monster_data[0][i], value)) {

            // we require cells in A:1 notation, therefore we transform column number to char
            return ALPHABET.charAt(i);
        }
    }
    sendMessage(id, "column '" + value + "' has not been found. skipped.");

    return null;
}

// returns row number in sheet -> starting at 1!
function getRowNumberByValue(id, table, value) {

    // search for the spreadsheet row the monsters data is in. +1 because sheet rows start counting at 1, not at 0
    for (var i = 0; i < table.length; i++) {

        if (entriesMatch(table[i][0], value)) {
            return i + 1;
        }
    }
    sendNotFoundMessage(id, value);
    return null;
}

// switches 0 (no crown) to 1 (crown) and the other way.
function changeCellValue(id, target_column, target_row) {
    var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName("monsters");
    var target_cell = sheet.getRange(target_column + target_row);

    if (target_cell.getValue() == "0") {
        target_cell.setValue('1');
    } else if (target_cell.getValue() == "1") {
        target_cell.setValue('0');
    } else {
        sendMessage(id, "Error. Expected Value 0 or 1 in cell " + target_column + target_row + " but found: " + target_cell.getValue() + "\nNo new values have been set.");
    }
}
