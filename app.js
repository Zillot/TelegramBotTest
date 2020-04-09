const cool = require('cool-ascii-faces')
const express = require('express')
const path = require('path')
const request = require('request');

const {Pool, Client} = require('pg');
const conString = 'postgres://bysidpvwnrioco:7b9d068106d53fe2dabffe7dd714fc8a902ed8d9b2f1a4f106c8756bb27eb0f4@ec2-54-217-204-34.eu-west-1.compute.amazonaws.com:5432/d2ein0u2eht31k';

const PORT = process.env.PORT || 5000

let lastProcessDate = null;

let setupsData = {
	helloText: '',
	errorText: '',
	successText: '',
	noRightsError: '',
	
	publishResultTemplate: '',
	
	questionForStep1: '',
	buttonsForStep1: [],
	questionForStep2: '',
	buttonsForStep2: [],
	questionForStep3: '',
	questionForStep4: '',
	
	telegramBotToken: '',
	telegramChatIdToPublish: -458746802,
	ignoreChatId: 123,
}
	
let adminId;

let buttonsForAdmin = [];
let questionForAdmin = '';

let posibleOrders = [];

let chatResults = [];

let globalMessages = [];
let globalOffset = 0;

app.use(express.json());

express()
	.use(express.static(path.join(__dirname, 'public')))
	.get('/', (req, res) => res.send(cool()))
	.get('/SetDefaults', (requester, responcer) => {
		DefaultData();
	})
	.get('/SetWebHooks', (requester, responcer) => {
		console.log(requester);

		Loop([req.body]);
		
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
			id: chat.id,
			data: null,
			lastOrder: null,
		};
		chatResults.push(chatResult);
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
	
	if (chat.id == setupsData.ignoreChatId) {		
		return;
	}
	
	if (lastUserMessage != null && lastUserMessage.message.text != null) {
		if (lastUserMessage.message.text == '/start') {
			Step1(chat, chatResult);
			return;
		}
	}
	
	if (lastUserMessage != null && lastUserMessage.message.text != null) {
		var order = posibleOrders.find(x => x.command == lastUserMessage.message.text);
		
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
	
	if ((chatResult.lastOrder == null || chatResult.lastOrder.orderNum == 1 || chatResult.lastOrder.orderNum == 6)) {
		Step1(chat, chatResult);
	}
	else if (chatResult.lastOrder.orderNum == 2) {
		Step2(lastUserMessage, chat, chatResult);
	}
	else if (chatResult.lastOrder.orderNum == 3) {
		Step3(lastUserMessage, chat, chatResult)
	}
	else if (chatResult.lastOrder.orderNum == 4) {
		Step4(lastUserMessage, chat, chatResult);
	}
	else if (chatResult.lastOrder.orderNum == 5) {
		StepDone(lastUserMessage, chat, chatResult);
	}
	else if (chatResult.lastOrder.orderNum == 100) {
		StepAdmin(lastUserMessage, chat, chatResult);
	}
}

//hello, select flow
function Step1(chat, chatResult) {
	if (chat.thread.length == 0) {
		SendMessage(chat.id, setupsData.helloText, (error, response) => {
			if (error) { errorHandler(error); }
		});
	}
	
	SendMessageButtons(chat.id, setupsData.questionForStep1, setupsData.buttonsForStep1, (error, response) => {
		if (error) { errorHandler(error); }
	});
	
	chatResult.data = {};
	SetOrderToChat(chat, chatResult, posibleOrders[1]);
}

//select building
function Step2(lastUserMessage, chat, chatResult) {
	if (CheckStepResult(lastUserMessage, chat, chatResult)) { return; }
	
	let text = lastUserMessage.message.text;
	let override = setupsData.navigationMapOverride.find(x => x.btnText == text);
	if (override != null) {
		GoToOrder(lastUserMessage, chat, chatResult, override.stepNum);
		return;
	}
	
	SendMessageButtons(chat.id, setupsData.questionForStep2, setupsData.buttonsForStep2, (error, response) => {
		if (error) { errorHandler(error); }
	});
	
	SetOrderToChat(chat, chatResult, posibleOrders[2]);
}

//enter phone
function Step3(lastUserMessage, chat, chatResult) {
	if (CheckStepResult(lastUserMessage, chat, chatResult)) { return; }
	
	SendMessage(chat.id, setupsData.questionForStep3, (error, response) => {
		if (error) { errorHandler(error); }
	});
	
	SetOrderToChat(chat, chatResult, posibleOrders[3]);
}

//enter comment
function Step4(lastUserMessage, chat, chatResult) {
	if (CheckStepResult(lastUserMessage, chat, chatResult)) { return; }
	
	SendMessage(chat.id, setupsData.questionForStep4, (error, response) => {
		if (error) { errorHandler(error); }
	});
	
	SetOrderToChat(chat, chatResult, posibleOrders[4]);
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

function GoToOrder(lastUserMessage, chat, chatResult, stepNum) {
	if (stepNum == 1) {
		Step1(lastUserMessage, chat, chatResult);
	}
	else if (stepNum == 2) {
		Step2(lastUserMessage, chat, chatResult);
	}
	else if (stepNum == 3) {
		Step3(lastUserMessage, chat, chatResult);
	}
	else if (stepNum == 4) {
		Step4(lastUserMessage, chat, chatResult);
	}
	else if (stepNum == 5) {
		Step5(lastUserMessage, chat, chatResult);
	}
	else if (stepNum == 6) {
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
	
	if (lastProcessDate != null) {
		messages.forEach(item => {		
			if (item.message.date > lastProcessDate) {
				if (chatIds.find(x => x == item.message.chat.id) == null) {
					chatIds.push(item.message.chat.id);
				}
			}
		});
	}
	
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
	
	posibleOrders = [
		{ text: setupsData.helloText, orderNum: 1, posibleAnsvers: ['/start'] },
		{ text: setupsData.questionForStep1, orderNum: 2, posibleAnsvers: ButtonsToList(setupsData.buttonsForStep1) },
		{ text: setupsData.questionForStep2, orderNum: 3, posibleAnsvers: ButtonsToList(setupsData.buttonsForStep2) },
		{ text: setupsData.questionForStep3, orderNum: 4, posibleAnsvers: [] },
		{ text: setupsData.questionForStep4, orderNum: 5, posibleAnsvers: [] },
		{ text: setupsData.successText, orderNum: 6, posibleAnsvers: [] },
		{ text: setupsData.questionForAdminRights, orderNum: 102, posibleAnsvers: [], command: 'Rights' },
		{ text: setupsData.questionForAdminSetups, orderNum: 101, posibleAnsvers: [], command: 'Setups' },
		{ text: setupsData.questionForAdminStep1, orderNum: 100, posibleAnsvers: ButtonsToList(buttonsForAdmin), command: '/admin' },
	];
}

function DefaultData() {
	globalOffset = 0;

	adminId = 267835012;
	
	setupsData = {
		successText: 'Інформацію отримано. Напиши мені сюди щось щоб створити нову заявку',
		errorText: 'Будьласка користуйтесь кнопками',
		helloText: 'Привіт!',
		noRightsError: 'Вам я на таке не відповім.',
		
		publishResultTemplate: 'Нова заявка, USERNAME, PHONE, COMMENT, BUILDING',
		
		questionForStep1: "Кого викликати?",
		buttonsForStep1: [["Електрика", "Сантехніка"], ["Бухгалтерія", "Інші роботи"]],
		
		questionForStep2: "Номер підїзду",
		buttonsForStep2: [["1", "2", "3"], ["4", "5", "6"], ["7"]],
		
		questionForStep3: "Номер телефону",
		
		questionForStep4: "Коментар",
		
		telegramBotToken: 'bot1268644831:AAG9mllT8DhDqz1uaD4yUt2k4_Vk6-hlqhk',
		
		navigationMapOverride: [
			{ btnText: "Бухгалтерія", stepNum: 3 }
		],
		
		questionForAdminStep1: 'Що треба змінити?',
		questionForAdminSetups: 'Мені потрібен JSON з налаштуваннями, ось поточній, напиши /admin для відміни',
		questionForAdminRights: 'Кому передаті права? Напиши Id користувача.',
		telegramChatIdToPublish: -458746802,
		ignoreChatId: 123
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
	let pool = new Pool({
		user: "bysidpvwnrioco",
		host: "ec2-54-217-204-34.eu-west-1.compute.amazonaws.com",
		database: "d2ein0u2eht31k",
		password: "7b9d068106d53fe2dabffe7dd714fc8a902ed8d9b2f1a4f106c8756bb27eb0f4",
		port: 5432
	});

	pool.query(script, (err, res) => {
		callback(res);
		pool.end();
	});
}

function CraetTables() {
	SendWebhook("https://telegram-bot-test-by-mykola.herokuapp.com/Webhook?token=9955cac3-581f-4950-8d8e-b3573f6427c4", () => {
	});
	
	DefaultData();
	
	runSql("CREATE TABLE IF NOT EXISTS botsetups ( id int, json TEXT )", (res) => {});
	
	runSql("CREATE TABLE IF NOT EXISTS adminsetups ( id int, adminId TEXT, globalOffset TEXT )", (res) => {});
	
	setTimeout(() => {
		runSql("Select * From botsetups", (res) => {
			if (!res.rows || res.rows.length == 0) {
				var json = JSON.stringify(setupsData);
				runSql(`INSERT INTO public.botsetups(id, json) VALUES (1, '${json}')`, (res) => { });
			}
		});
		
		runSql("Select * From adminsetups", (res) => {
			if (!res.rows || res.rows.length == 0) {
				runSql(`INSERT INTO public.adminsetups(id, adminid, globaloffset) VALUES (1, ${adminId}, ${globalOffset})`, (res) => { });
			}
		});
		
		setTimeout(() => {
			runSql("Select * From adminsetups", (res) => {			
				adminId = parseInt(res.rows[0].adminid);
				globalOffset = parseInt(res.rows[0].globaloffset);
			});
			
			runSql("Select * From botsetups", (res) => {
				let json = res.rows[0].json;
				setupsData = JSON.parse(json);
			});
			
			LoadSetups();
			
			setInterval(() => {
				GlobalOffsetSave();
			}, 60000);
		}, 5000);
	}, 1000)
}

function ConfirmSetupsSave() {
	var json = JSON.stringify(setupsData);
	runSql(`UPDATE public.botsetups SET json=${json} WHERE id=1;`, (res) => {});
	
	runSql(`UPDATE public.adminsetups SET adminid=${adminId}, globaloffset=${globalOffset} WHERE id=1;`, (res) => {});
}

function GlobalOffsetSave() {
	runSql(`UPDATE public.adminsetups SET adminid=${adminId}, globaloffset=${globalOffset} WHERE id=1;`, (res) => {});
}
