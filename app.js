const cool = require('cool-ascii-faces')
const express = require('express')
const path = require('path')
const request = require('request');

const {Pool, Client} = require('pg');

// ======= CHANGE BEFORE USE START
const defaultDBCOnnection = {
	user: "bysidpvwnrioco",
	host: "ec2-54-217-204-34.eu-west-1.compute.amazonaws.com",
	database: "d2ein0u2eht31k",
	password: "7b9d068106d53fe2dabffe7dd714fc8a902ed8d9b2f1a4f106c8756bb27eb0f4",
	port: 5432
};
		
const defaultTelegramBotToken = 'bot1268644831:AAG9mllT8DhDqz1uaD4yUt2k4_Vk6-hlqhk';
const defaultTelegramChatIdToPublish = -458746802;
const defaultAdminId = 267835012;
const defaultServerUrl = 'https://telegram-bot-test-by-mykola.herokuapp.com'
// ======= CHANGE BEFORE USE END

const PORT = process.env.PORT || 5000

let lastProcessDate = 0;

let setupsData = {}
	
let adminId;

let buttonsForAdmin = [];
let questionForAdmin = '';

let posibleOrders = [];

let chatResults = [];

let globalMessages = [];

express()
	.use(express.json())
	.use(express.static(path.join(__dirname, 'public')))
	.get('/', (req, res) => res.send(cool()))
	.get('/SetDefaults', (requester, responcer) => {
		DefaultData();
		ConfirmSetupsSave();
		
		responcer.send("success");
	})
	.post('/SetWebHooks', (requester, responcer) => {
		var message = requester.body;
		
		Loop([message]);
		
		responcer.send("success");
	})
	.listen(PORT, () => console.log(`Listening on ${ PORT }`));
	
CraetTables();

function Loop(newMessages) {
	let mesages = "";
	
	globalMessages = globalMessages.concat(newMessages);
	
	if (globalMessages.length == 0) {
		return;
	}
	
	let chats = GetMessagesByChat(globalMessages);
	let updatedChatIds = GetChatIdsWithUpdates(newMessages);
	
	updatedChatIds.forEach(updatedChatId => {			
		var chat = chats.find(x => x.id == updatedChatId)
		PoccessMessage(chat);
	});
}

function PoccessMessage(chat) {
	var chatResult = chatResults.find(x => x.id == chat.id);
	if (chatResult == null) {
		chatResult = {
			chatId: null,
			chatName: null,
			id: chat.id,
			data: {},
			lastOrder: null,
		};
		chatResults.push(chatResult);
		GetUserName(chat.id, chatResult);
	}
	
	let lastUserMessage = null;
	if (chat.thread.length > 0) {
		lastUserMessage = chat.thread[chat.thread.length - 1];
	}
	
	if (lastUserMessage != null && lastUserMessage.message.text == '/getgroupid') {
		SendMessage(chat.id, lastUserMessage.message.chat.id, (error, response) => {
			if (error) { errorHandler(error); }
		});
		
		return;
	}
	
	if (lastUserMessage != null && lastUserMessage.message.text == '/getmyid') {
		SendMessage(chat.id, lastUserMessage.message.from.id, (error, response) => {
			if (error) { errorHandler(error); }
		});
		
		return;
	}
	
	if (chat.id == setupsData.telegramChatIdToPublish) {		
		return;
	}
	
	if (lastUserMessage != null && lastUserMessage.message.text != null) {
		if (lastUserMessage.message.text == '/start') {
			Step1(chat, chatResult);
			return;
		}
	}
	
	let order = null;
	
	if (lastUserMessage != null && lastUserMessage.message.text != null) {
		order = posibleOrders.find(x => x.command == lastUserMessage.message.text);
		if (!order) {
			order = posibleOrders[0];
		}
		
		if (order != null) {
			if(!IsAdmin(chat, lastUserMessage)) {
				return;
			}
	
			SetOrderToChat(chat, chatResult, order);
			GoToOrder(lastUserMessage, chat, chatResult, order.orderNum);
			
			return;
		}
	}
	
	if (chatResult.lastOrder && chatResult.lastOrder.orderNum >= 100) {
		if(!IsAdmin(chat, lastUserMessage)) {
			chatResult.lastOrder = null;
			return;
		}
		
		CheckAdminStep(chat, chatResult, chatResult.lastOrder.orderNum, lastUserMessage);
	}
	
	var orderNum = chatResult.lastOrder == null ? 1 : chatResult.lastOrder.orderNum;
	
	if (orderNum == setupsData.steps.length) {
		orderNum = 2;
	}
	
	if (chat.thread.length == 0) {
		SendMessage(chat.id, setupsData.helloText, (error, response) => {
			if (error) { errorHandler(error); }
		});
	}

	if (orderNum < setupsData.steps.length - 1) {	
		console.log("DEBUGGER");
		
		console.log(lastUserMessage);
		console.log(order);
		
		console.log("DEBUGGER");
		Step(order, lastUserMessage, chat, chatResult);
	}
	else if (orderNum == setupsData.steps.length) {
		StepDone(lastUserMessage, chat, chatResult);
	}
	else if (chatResult.lastOrder.orderNum == 100) {
		StepAdmin(lastUserMessage, chat, chatResult);
	}
}

//hello, select flow
function Step(order, lastUserMessage, chat, chatResult) {	
	if (order.orderNum == 1 && chatResult.chatName != null) {
		SetOrderToChat(chat, chatResult, posibleOrders[order.orderNum + 1]);
		Step(posibleOrders[order.orderNum + 1], lastUserMessage, chat, chatResult);
		return;
	}

	if (order.orderNum == 2) {
		chatResult.data = {};
	}

	if (order.orderNum != 2) {
		if (CheckStepResult(lastUserMessage, chat, chatResult)) { return; }
	}
	
	let text = lastUserMessage.message.text;
	let override = setupsData.navigationMapOverride.find(x => x.btnText == text);
	if (override != null) {
		GoToOrder(lastUserMessage, chat, chatResult, override.stepNum);
		return;
	}
	
	if (setupsData.steps[order.orderNum].buttons.length > 0) {
		SendMessageButtons(chat.id, setupsData.steps[order.orderNum].question, setupsData.steps[order.orderNum].buttons, (error, response) => {
			if (error) { errorHandler(error); }
		});
	}
	else {
		SendMessage(chat.id, setupsData.steps[order.orderNum].question, (error, response) => {
			if (error) { errorHandler(error); }
		});
	}
	
	SetOrderToChat(chat, chatResult, posibleOrders[order.orderNum + 1]);
}

function StepDone(lastUserMessage, chat, chatResult) {
	if (CheckStepResult(lastUserMessage, chat, chatResult)) { return; }
	
	SendMessage(chat.id, setupsData.successText, (error, response) => {
		if (error) { errorHandler(error); }
	});
	
	var templatedData = setupsData.publishResultTemplate + "";
	templatedData = templatedData.replace("BUILDING", chatResult.data[3]);
	templatedData = templatedData.replace("PHONE", chatResult.data[4]);
	templatedData = templatedData.replace("COMMENT", chatResult.data[5]);
	templatedData = templatedData.replace("USERNAME", `${lastUserMessage.message.from.first_name} ${lastUserMessage.message.from.last_name}`);
	
	console.log(templatedData);
	
	SetOrderToChat(chat, chatResult, null);
	
	SendMessage(setupsData.telegramChatIdToPublish, templatedData, (error, response) => {
		if (error) { errorHandler(error); }
	});
}

function IsAdmin(chat, lastUserMessage) {
	var rights = lastUserMessage.message.from.id == adminId;
	
	return rights;
}

function CheckAdminStep(chat, chatResult, orderNum, lastUserMessage) {
	//setups
	if (orderNum == 101) {
		//TODO check model
		setupsData = JSON.parse(lastUserMessage.message.text);
		ConfirmSetupsSave();
		
		SendMessage(chat.id, "save success", (error, response) => {
			if (error) { errorHandler(error); }
		});
	
		SetOrderToChat(chat, chatResult, null);
	}	
	
	//rights
	if (orderNum == 102) {
		adminId = lastUserMessage.message.text;
		ConfirmSetupsSave();
		
		SendMessage(chat.id, "admin changed", (error, response) => {
			if (error) { errorHandler(error); }
		});
	
		SetOrderToChat(chat, chatResult, null);
	}
}

function StepAdmin(lastUserMessage, chat, chatResult) {
	if(!IsAdmin(chat, lastUserMessage)) {
		return;
	}
	
	SendMessageButtons(chat.id, setupsData.questionForAdminStep1, buttonsForAdmin, (error, response) => {
		if (error) { errorHandler(error); }
	});
	
	SetOrderToChat(chat, chatResult, posibleOrders[posibleOrders.length - 1]);
}

function StepAdminSetups(lastUserMessage, chat, chatResult) {
	if(!IsAdmin(chat, lastUserMessage)) {
		return;
	}
	
	SendMessage(chat.id, setupsData.questionForAdminSetups, (error, response) => {
		if (error) { errorHandler(error); }
	});
	
	setTimeout(() => {
		SendMessage(chat.id, JSON.stringify(setupsData), (error, response) => {
			if (error) { errorHandler(error); }
		});
	}, 500);
	
	SetOrderToChat(chat, chatResult, posibleOrders[posibleOrders.length - 2]);
}

function StepAdminRights(lastUserMessage, chat, chatResult) {
	if(!IsAdmin(chat, lastUserMessage)) {
		return;
	}
	
	SendMessage(chat.id, setupsData.questionForAdminRights, (error, response) => {
		if (error) { errorHandler(error); }
	});
	
	SetOrderToChat(chat, chatResult, posibleOrders[posibleOrders.length - 3]);
}

function GoToOrder(order, lastUserMessage, chat, chatResult, stepNum) {
	if (orderNum < setupsData.steps.length - 1) {
		Step(order, lastUserMessage, chat, chatResult);
	}
	else if (orderNum == setupsData.steps.length) {
		StepDone(lastUserMessage, chat, chatResult);
	}
	else if (stepNum == 100) {
		StepAdmin(lastUserMessage, chat, chatResult);
	}
	else if (stepNum == 101) {
		StepAdminSetups(lastUserMessage, chat, chatResult);
	}
	else if (stepNum == 102) {
		StepAdminRights(lastUserMessage, chat, chatResult);
	}
}

function CheckStepResult(lastUserMessage, chat, chatResult) {
	if (chatResult.lastOrder.posibleAnsvers.length > 0 && !chatResult.lastOrder.posibleAnsvers.find(x => x == lastUserMessage.message.text)) {
		ErrorStep(chat);
		return true;
	}
	
	chatResult.data[chatResult.lastOrder.orderNum] = lastUserMessage.message.text;
	
	if (chatResult.lastOrder.orderNum == 2) {
		SaveUserName(chatResult.id, lastUserMessage.message.text);
	}

	return false;
}

function ErrorStep(chat) {
	SendMessage(chat.id, setupsData.errorText, (error, response) => {
		if (error) { errorHandler(error); }
	});
}

function SetOrderToChat(chat, chatResult, order) {
	chatResult.lastOrder = order;
}

function GetChatIdsWithUpdates(messages) {
	var chatIds = [];
	
	messages.forEach(item => {		
		if (item.message.date > lastProcessDate) {
			if (chatIds.find(x => x == item.message.chat.id) == null) {
				chatIds.push(item.message.chat.id);
			}
		}
	});
	
	messages
		.map(item => item.message.date)
		.forEach(date => {
			if (lastProcessDate < date) {
				lastProcessDate = date;
			}
		});
	
	return chatIds;
}

function GetMessagesByChat(messages) {
	let groupedByChatMessages = [];

	messages.forEach(item => {
		if (item.message == null) {
			item.message = item.edited_message;
		}
		
		let chatId = item.message.chat.id;
		let chat = groupedByChatMessages.find(x => x && chatId === x.id);
		if (chat == null) {
			chat = {
				id: item.message.chat.id,
				chat: item.message.chat,
				thread: [],
			};
			
			groupedByChatMessages.push(chat);
		}

		chat.thread.push(item);
	});
	
	return groupedByChatMessages;
}

//======= API CALLS =======
function CheckUpdates(offset, callback) {
	var url = `https://api.telegram.org/${setupsData.telegramBotToken}/getUpdates?offset=${offset}`;
	
	setTimeout(() => {
		request(url, { json: true }, (error, res, body) => {
			if (error || res.statusCode !== 200) {
				return callback(error || {statusCode: res.statusCode});
			}
			
			callback(null, res);
		});
	}, 500);
}

function SendWebhook(hookUrl, callback) {
	hookUrl = GetTextLineForUrl(hookUrl);
	
	var url = `https://api.telegram.org/${setupsData.telegramBotToken}/setWebhook?url=${hookUrl}&max_connections=10`;
	
	setTimeout(() => {
		request({ url: url, method: 'POST', json: true }, (error, res, body) => {
			if (error || res.statusCode !== 200) {
				return callback(error || {statusCode: res.statusCode});
			}
			
			callback(null, res);
		});
	}, 500);
}

function SendMessage(chat_id, text, callback) {
	text = GetTextLineForUrl(text);
	
	var url = `https://api.telegram.org/${setupsData.telegramBotToken}/sendMessage?chat_id=${chat_id}&text=${text}`;
	
	setTimeout(() => {
		request({ url: url, method: 'POST', json: true }, (error, res, body) => {
			if (error || res.statusCode !== 200) {
				return callback(error || {statusCode: res.statusCode});
			}
			
			callback(null, res);
		});
	}, 500);
}

function SendMessageButtons(chat_id, text, buttonLines, callback) {
	text = GetTextLineForUrl(text);
	var url = `https://api.telegram.org/${setupsData.telegramBotToken}/sendMessage?chat_id=${chat_id}&text=${text}`;
	
	var buttons = [];
	buttonLines.forEach(line => {
		var btnLine = [];
		line.forEach(btn => {
			btnLine.push([{
				text: btn,
				callback_data: btn
			}]);
		});
		
		buttons.push(btnLine);
	});
	
	var buttonOptions = { 
		reply_markup: {
			keyboard: buttonLines, 
			resize_keyboard: true, 
			one_time_keyboard: true
		}
	};
	
	setTimeout(() => {
		request({ url: url, method: 'POST', json: buttonOptions }, (error, res, body) => {
			if (error || res.statusCode !== 200) {
				return callback(error || {statusCode: res.statusCode});
			}
			
			callback(null, res);
		});
	}, 500);
}

function GetTextLineForUrl(line) {
	return encodeURI(line);
}

function errorHandler(error) {
	if (error) {
		console.log(error);
	}
}

//======= Setups =========
function LoadSetups() {		
	buttonsForAdmin = [["Rights"], ["Setups"]];
	
	let userSteps = [];
	let stepIndex = 1;
	setupsData.steps.forEach(step => {
		userSteps.push({
			orderNum: stepIndex++,
			text: step.question,  
			posibleAnsvers: ButtonsToList(step.buttons)
		})
	});
	
	posibleOrders = userSteps.concat([
		{ text: setupsData.helloText, orderNum: 1, posibleAnsvers: ['/start'] },
		{ text: setupsData.successText, orderNum: 6, posibleAnsvers: [] },
		{ text: setupsData.questionForAdminRights, orderNum: 102, posibleAnsvers: [], command: 'Rights' },
		{ text: setupsData.questionForAdminSetups, orderNum: 101, posibleAnsvers: [], command: 'Setups' },
		{ text: setupsData.questionForAdminStep1, orderNum: 100, posibleAnsvers: ButtonsToList(buttonsForAdmin), command: '/admin' }
	])
}

function DefaultData() {
	adminId = defaultAdminId;
	
	setupsData = {
		successText: 'Інформацію отримано. Напиши мені сюди щось щоб створити нову заявку',
		errorText: 'Будьласка користуйтесь кнопками',
		helloText: 'Привіт!',
		noRightsError: 'Вам я на таке не відповім.',
		
		publishResultTemplate: 'Нова заявка, COMPANY, USERNAME, PHONE, COMMENT, BUILDING',
		
		steps: [
			{
				question: "Назва компанії",
				buttons: []
			},
			{
				question: "Кого викликати?",
				buttons: [["Електрика", "Сантехніка"], ["Бухгалтерія", "Інші роботи"]]
			},
			{
				question: "Номер підїзду",
				buttons: [["1", "2", "3"], ["4", "5", "6"], ["7"]]
			},
			{
				question: "Номер телефону",
				buttons: []
			},
			{
				question: "Коментар",
				buttons: []
			}
		],
		
		telegramBotToken: defaultTelegramBotToken,
		
		navigationMapOverride: [
			{ btnText: "Бухгалтерія", stepNum: 4 }
		],
		
		questionForAdminStep1: 'Що треба змінити?',
		questionForAdminSetups: 'Мені потрібен JSON з налаштуваннями, ось поточній, напиши /admin для відміни',
		questionForAdminRights: 'Кому передаті права? Напиши Id користувача.',
		telegramChatIdToPublish: defaultTelegramChatIdToPublish
	}
}

//======= Helpers ========

function ButtonsToList(buttonsLines) {
	let buttons = [];
	let buttonsLinesFix = [];
	
	buttonsLines.forEach(line => {
		line.forEach(button => {
			buttons.push(button)
		});
	});
	
	return buttons;
}

function runSql(script, callback) {
	let pool = new Pool(defaultDBCOnnection);

	pool.query(script, (err, res) => {
		callback(res);
		pool.end();
	});
}

function CraetTables() {
	SendWebhook(`${defaultServerUrl}/SetWebHooks`, () => { });
	
	DefaultData();
	
	runSql("CREATE TABLE IF NOT EXISTS botsetups ( id int, json TEXT )", (res) => {});
	
	runSql("CREATE TABLE IF NOT EXISTS adminsetups ( id int, adminId TEXT )", (res) => {});
	
	runSql("CREATE TABLE IF NOT EXISTS telegramusers ( id serial PRIMARY KEY, chatId int, chatName TEXT )", (res) => {});
	
	setTimeout(() => {
		runSql("Select * From botsetups", (res) => {
			if (!res.rows || res.rows.length == 0) {
				var json = JSON.stringify(setupsData);
				runSql(`INSERT INTO public.botsetups(id, json) VALUES (1, '${json}')`, (res) => { });
			}
		});
		
		runSql("Select * From adminsetups", (res) => {
			if (!res.rows || res.rows.length == 0) {
				runSql(`INSERT INTO public.adminsetups(id, adminid) VALUES (1, ${adminId})`, (res) => { });
			}
		});
		
		setTimeout(() => {
			runSql("Select * From adminsetups", (res) => {			
				adminId = parseInt(res.rows[0].adminid);
			});
			
			runSql("Select * From botsetups", (res) => {
				let json = res.rows[0].json;
				setupsData = JSON.parse(json);
			});
			
			LoadSetups();
		}, 5000);
	}, 1000)
}

function ConfirmSetupsSave() {
	var json = JSON.stringify(setupsData);
	runSql(`UPDATE public.botsetups SET json=${json} WHERE id=1;`, (res) => {});
	
	runSql(`UPDATE public.adminsetups SET adminid=${adminId} WHERE id=1;`, (res) => {});
}

function SaveUserName(chatId, name, chatResult) {
	runSql(`INSERT INTO public.telegramusers(chatId, chatName) VALUES (${chatId}, '${name}')`, (res) => {
		chatResult.chatId = chatId;
		chatResult.chatName = name;
	});
}

function GetUserName(chatId, chatResult) {
	runSql(`Select * From telegramusers Where chatId = ${chatId}`, (res) => {
		chatResult.chatId = chatId;
		
		if (res && res.rows && res.rows.length > 0) {
			chatResult.chatName = res.rows[0].chatName;
		}
	});
}
