'use strict';

var Alexa = require('alexa-sdk');
var APP_ID = undefined; // TODO replace with your app ID (OPTIONAL).
var recipes = require('./recipes');
var parseString = require('xml2js').parseString;
var http = require('http');

function queryNextbus(all, callback) {

    var options = {
      //http://webservices.nextbus.com/service/publicXMLFeed?command=predictions&a=unitrans&r=O&s=22175
        host: 'webservices.nextbus.com',
        //path: '/service/publicXMLFeed?command=predictions&a=unitrans&r=O&s=22175',
        path: '/service/publicXMLFeed?command=predictions&a=unitrans&stopId=175',
        method: 'GET'
    };

    var req = http.request(options, (res) => {

        var body = '';

        res.on('data', (d) => {
            body += d;
        });

        res.on('end', function () {
            parseString(body, function (err, result) {
                //console.log(util.inspect(result, false, null));
                let departures = result.body.predictions;
                departures = departures.filter(function(prediction) {
                    return prediction.direction != undefined;
                });
                departures = departures.map(function(prediction) {
                //for (let prediction of result.body.predictions) {
                    let route = prediction['$'].routeTag // or tag
                    console.log('route: ' + route);

                    let minMinutes = 1440;
                    let minDirection = '';

                    let minutes = prediction.direction.map(function(direction) {
                        let currentDirection = direction['$'].title;

                        console.log('direction: ' + currentDirection);
                        return direction.prediction.map(function(prediction) {
                            let currentMinutes = prediction['$'].minutes;
                            console.log(currentMinutes);
                            return Number(currentMinutes);
                            //if (currentMinutes < minMinutes) {
                            //    minMinutes = currentMinutes;
                            //    minDirection = currentDirection;
                            //}
                        });
                    });

                    minutes = [].concat.apply([], minutes);
                    minutes.sort(function(a,b) {
                        return a - b;
                    });

                    //console.log(minDirection + ' in ' + minMinutes);
                    return {route: route, minutes: minutes};
                });

                console.log(departures);//.sort(function(a, b) {return a.minutes - b.minutes}));

                if (!all) {
                    callback(departures);
                    return
                }
                // ----

                departures = departures.map(function(line) {
                    return line.minutes.map(function(minute) {
                        return {route: line.route, minutes: minute};
                    });
                });
                departures = [].concat.apply([], departures);
                departures.sort(function(a,b) {
                  return a.minutes - b.minutes;
                });

                console.log(departures);
                callback(departures);
            });
        });

    });
    req.end();

    req.on('error', (e) => {
        console.error(e);
    });
}

exports.handler = function(event, context, callback) {
    var alexa = Alexa.handler(event, context);
    alexa.APP_ID = APP_ID;
    // To enable string internationalization (i18n) features, set a resources object.
    alexa.resources = languageStrings;
    alexa.registerHandlers(handlers);
    alexa.execute();
};

var handlers = {
    //Use LaunchRequest, instead of NewSession if you want to use the one-shot model
    // Alexa, ask [my-skill-invocation-name] to (do something)...
    'LaunchRequest': function () {
        this.attributes['speechOutput'] = this.t("WELCOME_MESSAGE", this.t("SKILL_NAME"));
        // If the user either does not reply to the welcome message or says something that is not
        // understood, they will be prompted again with this text.
        this.attributes['repromptSpeech'] = this.t("WELCOME_REPROMT");
        this.emit(':ask', this.attributes['speechOutput'], this.attributes['repromptSpeech'])
    },
	'AllIntent': function () {
        var self = this;
		queryNextbus(true, function(departures) {
            var speechOutput = '';
            for(let bus of departures) {
                var route = bus.route.replace("_OWL", " Owl");
                speechOutput += route + ' bus in ' + bus.minutes + (bus.minutes == 1 ? ' minute, ' : ' minutes, ');
            }

            if(speechOutput == '') {
                speechOutput = "I\'m sorry, there don't seem to be any arrivals at all at the moment.";
            }

            self.attributes['speechOutput'] = speechOutput;
            self.emit(':tell', speechOutput);
        });
	},
	
    'RecipeIntent': function () {
        var itemSlot = this.event.request.intent.slots.Item;
        var itemName; //
        if (itemSlot && itemSlot.value) {
            itemName = itemSlot.value.toLowerCase();
		}

        var self = this;

        queryNextbus(false, function(departures) {
            var recipe = departures.find(function(line) {
                return line.route.toLowerCase() == itemName;
            });

            if (recipe) {
                var minutes = recipe.minutes;
                minutes = [minutes.slice(0, -1).join(', '), minutes.slice(-1)[0]].join(minutes.length < 2 ? '' : ' and ');

                self.attributes['speechOutput'] = minutes; //says the recipe
                //this.attributes['repromptSpeech'] = this.t("RECIPE_REPEAT_MESSAGE");
                self.emit(':tell', recipe.route + " bus arriving in " + minutes + (minutes.length == 1 && minutes[0] == 1 ? ' minute' : " minutes"));
            } else {
                var speechOutput = self.t("RECIPE_NOT_FOUND_MESSAGE");
                var repromptSpeech = self.t("RECIPE_NOT_FOUND_REPROMPT");
                if (itemName) {
                    speechOutput += self.t("RECIPE_NOT_FOUND_WITH_ITEM_NAME", itemName);
                } else {
                    speechOutput += self.t("RECIPE_NOT_FOUND_WITHOUT_ITEM_NAME");
                }
                speechOutput += repromptSpeech;

                self.attributes['speechOutput'] = speechOutput;
                self.attributes['repromptSpeech'] = repromptSpeech;

                self.emit(':ask', speechOutput, repromptSpeech);
            }
        });

    },
    'AMAZON.HelpIntent': function () {
        this.attributes['speechOutput'] = this.t("HELP_MESSAGE");
        this.attributes['repromptSpeech'] = this.t("HELP_REPROMT");
        this.emit(':ask', this.attributes['speechOutput'], this.attributes['repromptSpeech'])
    },
    'AMAZON.RepeatIntent': function () {
        this.emit(':ask', this.attributes['speechOutput'], this.attributes['repromptSpeech'])
    },
    'AMAZON.StopIntent': function () {
        this.emit('SessionEndedRequest');
    },
    'AMAZON.CancelIntent': function () {
        this.emit('SessionEndedRequest');
    },
    'SessionEndedRequest':function () {
        this.emit(':tell', this.t("STOP_MESSAGE"));
    }
};

var languageStrings = {
    "en-GB": {
        "translation": {
            "RECIPES": recipes.RECIPE_EN_GB,
            "SKILL_NAME": "myBus",
            "WELCOME_MESSAGE": "Welcome to %s. You can ask a question like, when\'s the A bus coming? ... Now, what can I help you with.",
            "WELCOME_REPROMT": "For instructions on what you can say, please say help me.",
            "DISPLAY_CARD_TITLE": "%s  - Route %s.",
            "HELP_MESSAGE": "You can ask questions such as, what\'s the recipe, or, you can say exit...Now, what can I help you with?",
            "HELP_REPROMT": "You can say things like, what\'s the recipe, or you can say exit...Now, what can I help you with?",
            "STOP_MESSAGE": "Goodbye!",
            "RECIPE_REPEAT_MESSAGE": "Try saying repeat.",
            "RECIPE_NOT_FOUND_MESSAGE": "I\'m sorry, I currently do not know ",
            "RECIPE_NOT_FOUND_WITH_ITEM_NAME": "the recipe for %s. ",
            "RECIPE_NOT_FOUND_WITHOUT_ITEM_NAME": "that recipe. ",
            "RECIPE_NOT_FOUND_REPROMPT": "What else can I help with?"
        }
    },
    "en-US": {
        "translation": {
            "RECIPES" : recipes.RECIPE_EN_US,
            "SKILL_NAME" : "myBus",
            "WELCOME_MESSAGE": "Welcome to %s. You can ask a question like, when\'s the A bus?, or, all arrivals. ... Now, what can I help you with.",
            "WELCOME_REPROMT": "For instructions on what you can say, please say help me.",
            "DISPLAY_CARD_TITLE": "%s  - Route for %s.",
            "HELP_MESSAGE": "You can ask questions such as, when\'s the A bus, all arrivals, or, you can say exit...Now, what can I help you with?",
            "HELP_REPROMT": "You can say things like, when\'s the A bus, all arrivals, or you can say exit...Now, what can I help you with?",
            "STOP_MESSAGE": "Goodbye!",
            "RECIPE_REPEAT_MESSAGE": "Try saying repeat.",
            "RECIPE_NOT_FOUND_MESSAGE": "I\'m sorry, there don't seem to be any arrivals for ",
            "RECIPE_NOT_FOUND_WITH_ITEM_NAME": "the %s route. ",
            "RECIPE_NOT_FOUND_WITHOUT_ITEM_NAME": "that route. ",
            "RECIPE_NOT_FOUND_REPROMPT": "What else can I help with?"
        }
    },
    "de-DE": {
        "translation": {
            "RECIPES" : recipes.RECIPE_DE_DE,
            "SKILL_NAME" : "Assistent für Minecraft in Deutsch",
            "WELCOME_MESSAGE": "Willkommen bei %s. Du kannst beispielsweise die Frage stellen: Welche Rezepte gibt es für eine Truhe? ... Nun, womit kann ich dir helfen?",
            "WELCOME_REPROMT": "Wenn du wissen möchtest, was du sagen kannst, sag einfach „Hilf mir“.",
            "DISPLAY_CARD_TITLE": "%s - Rezept für %s.",
            "HELP_MESSAGE": "Du kannst beispielsweise Fragen stellen wie „Wie geht das Rezept für“ oder du kannst „Beenden“ sagen ... Wie kann ich dir helfen?",
            "HELP_REPROMT": "Du kannst beispielsweise Sachen sagen wie „Wie geht das Rezept für“ oder du kannst „Beenden“ sagen ... Wie kann ich dir helfen?",
            "STOP_MESSAGE": "Auf Wiedersehen!",
            "RECIPE_REPEAT_MESSAGE": "Sage einfach „Wiederholen“.",
            "RECIPE_NOT_FOUND_MESSAGE": "Tut mir leid, ich kenne derzeit ",
            "RECIPE_NOT_FOUND_WITH_ITEM_NAME": "das Rezept für %s nicht. ",
            "RECIPE_NOT_FOUND_WITHOUT_ITEM_NAME": "dieses Rezept nicht. ",
            "RECIPE_NOT_FOUND_REPROMPT": "Womit kann ich dir sonst helfen?"
        }
    }
};
