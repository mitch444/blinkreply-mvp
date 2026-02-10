
$('.addPerson').click(function(){
    $('.pad').css({
        'z-index': '-1',
        'opacity': '0'
    });
})

$('.dial_pad_btn').click(function() {

    let phoneNumber = $(this).data('number').toString();
    let countryCode = phoneNumber.substring(0, 2);
    let areaCode = phoneNumber.substring(2, 5);
    let firstPart = phoneNumber.substring(5, 8);
    let secondPart = phoneNumber.substring(8, 12);

    let formattedPhoneNumber = `${countryCode} (${areaCode}) ${firstPart}-${secondPart}`;

    $(".digits.digits-container").css("display", "block");
    $('.phoneString input').val($(this).data('number'));

    $('.contact-name').text($(this).data('name'));
    $('.ca-name').text($(this).data('name'));

    $('.ca-number').text(formattedPhoneNumber);
    $('.contact-number').text(formattedPhoneNumber);

    $('.pad').css({
        'z-index': '9999',
        'opacity': '1'
    });

    $('.dig.goBack.action-dig').css({
        'display': 'none'
    });

});

$('.number-dig').click(function() {
    //add animation
    addAnimationToButton(this);
    //add number
    var currentValue = $('.phoneString input').val();
    if(currentValue.length < 10)
    {
        var valueToAppend = $(this).attr('name');
        $('.phoneString input').val(currentValue + valueToAppend);
    };
});

var timeoutTimer = true;
var timeCounter = 0;
var timeCounterCounting = true;

$('.action-dig').click(function() {
    //add animation
    addAnimationToButton(this);
    if ($(this).hasClass('goBack')) {
        var currentValue = $('.phoneString input').val();
        var newValue = currentValue.substring(0, currentValue.length - 1);
        $('.phoneString input').val(newValue);
    } else {
        // Hide the call button
        $(this).hide();

        // Show the end call button.
        $('.end-call').show();

        // Hide dial page initially.
        $('.dial-pad').hide();

        $('.call-pad').css('opacity', 1);

        $('.ca-status').text('Calling');
        setTimeout(function() {
            timeoutTimer = true;
            looper();
            //showActiveCallAfterAFewSeconds
            setTimeout(function() {
                timeoutTimer = false;
                timeCounterCounting = true;
                timeCounterLoop();

                $('.pulsate').toggleClass('active-call');
                $('.ca-status').animate({
                    opacity: 0,
                }, 1000, function() {
                    $(this).text('00:00');
                    $('.ca-status').attr('data-dots', '');

                    $('.ca-status').animate({
                        opacity: 1,
                    }, 1000);
                });
            }, 3000);
        }, 500);
    }
});

var timeCounterLoop = function() {

    if (timeCounterCounting) {
        setTimeout(function() {
            var timeStringSeconds = '';
            var minutes = Math.floor(timeCounter / 60.0);
            var seconds = timeCounter % 60;
            if (minutes < 10) {
                minutes = '0' + minutes;
            }
            if (seconds < 10) {
                seconds = '0' + seconds;
            }
            $('.ca-status').text(minutes + ':' + seconds);

            timeCounter += 1;

            timeCounterLoop();
        }, 2000);
    }
};

var dots = 0;
var looper = function() {
    if (timeoutTimer) {

        setTimeout(function() {
            if (dots > 3) {
                dots = 0;
            }
            var dotsString = '';
            for (var i = 0; i < dots; i++) {
                dotsString += '.';
            }
            $('.ca-status').attr('data-dots', dotsString);
            dots += 1;

            looper();
        }, 500);
    }
};

var hangUpCall = function() {
    timeoutTimer = false;
};

var addAnimationToButton = function(thisButton) {
    //add animation
    $(thisButton).removeClass('clicked');
    var _this = thisButton;
    setTimeout(function() {
        $(_this).addClass('clicked');
    }, 1);
};

var showUserInfo = function(userInfo) {

    $('.avatar').attr('style', "background-image: url(" + userInfo.image + ")");
    if (!$('.contact').hasClass('showContact')) {
        $('.contact').addClass('showContact');
    }
    $('.contact-name').text(userInfo.name);
    $('.contact-position').text(userInfo.desc);
    var matchedNumbers = $('.phoneString input').val();
    var remainingNumbers = userInfo.number.substring(matchedNumbers.length);
    $('.contact-number').html("<span>" + matchedNumbers + "</span>" + remainingNumbers);

    //update call elements
    $('.ca-avatar').attr('style', 'background-image: url(' + userInfo.image + ')');
    $('.ca-name').text(userInfo.name);
    $('.ca-number').text(userInfo.number);

};

var hideUserInfo = function() {
    $('.contact').removeClass('showContact');
};

/**
 * Global Variables
 */
var token; // Twilio access token
var identity; // Agent identity
var device; // Twilio deice
var phone_number; // Twilio phone number

// Get twilio access token.
getTwilioAccessToken();
// Setup twilio device.
/**
 * Functions
 */

// Get the twilio access token.
async function getTwilioAccessToken() {
    console.log("Requesting an access token for twilio..");

    try {
        // Get the data from our backend / access token.
        const data = await (await fetch("/phone/access-token")).json();

        console.log('Got the twilio access token', data);

        // Set the token.
        token = data.token;

        // Set the identity.
        identity = data.identity;

        // Set the phone number.
        phone_number = data.phone_number;

        // Initialize the device.
        initializeDevice();
    } catch (error) {
        console.log(error);
    }
}

// Function to initialzie the twilio device.
function initializeDevice() {
    console.log('Initilizing twilio device!!');

    // Init device.
    device = new Twilio.Device(token, {
        logLevel: 1,
        codecPreferences: ['opus', 'pcmu'],
        maxCallSignalingTimeoutMs: 30000,
        debug: true,
        warnings: true
    });

    device.on('error', function (error) {
        console.error('Twilio Device Error: ', error);
    });

    device.on('connect', function (conn) {
        console.log('Successfully connected');
    });

    device.on('disconnect', function (conn) {
        console.log('Disconnected');
    });

    device.on('incoming', function (conn) {
        console.log('Incoming connection from ', conn.parameters.From);
        conn.accept();
    });

    // Register Event Listeners
    registerPhoneEventListeners();

    // Register the device.
    device.register();

    console.log('Twilio device successfully initialized');
}

// Function for the phone front-end specific event listeners.
async function registerPhoneEventListeners() {

    // For when the call button has been clicked. (OUTBOUND CALL)
    $('.call').on('click', async function() {
        // Get the phone number to call.
        var phoneNumberToCall = $('input[type="text"]').val();

        // Set the twilio parameters up.
        var params = {
            To: phoneNumberToCall,
            agent: identity,
            callerId: phone_number,
            Location: 'US1'
        }

        // If device exists, call the client/customer etc.
        if (device) {
            // Call the agent/customer
            const call = await device.connect({
                params
            });

            // Register call event listeners
            call.on("disconnect", updateUiDisconnectedOutgoingCall);

            // Register hangup button listener.
            $('.end-call').on('click', function() {
                hangupTelephoneCall(call);
            });

            // Register mute button listener.
            $('.mute').on('click', function() {
                muteTelephoneCall(call);
            });

            // Register unmute button listener.
            $('.unmute').on('click', function() {
                unmuteTelephoneCall(call);
            });
        }
    });

    // For when an inbound call is coming.
    device.on("incoming", handleIncomingPhoneCall);
}

// Function to hangup the telephone call
function hangupTelephoneCall(call) {
    console.log('Hanging up the call from our end.');

    // Disconnect the call.
    call.disconnect();

    // Update the UI.
    updateUiDisconnectedOutgoingCall();
    $('.pad').css({
        'z-index': '-1',
        'opacity': '0'
    });
}

// Function to mute a telephone call.
function muteTelephoneCall(call) {
    console.log('Muting ourselves on the call');

    call.mute(true); // Mute the call.

    // Update the classes.
    $('.mute').hide();
    $('.unmute').show();
}

// Function to unmute a telephone call.
function unmuteTelephoneCall(call) {
    console.log('Unmuting ourselves on the call');

    call.mute(false); // Unmute the call.

    // Update the classes.
    $('.mute').show();
    $('.unmute').hide();
}

// Function to handle the ui when the other user disconnects the call.
function updateUiDisconnectedOutgoingCall() {
    // Handle ui.
    $('.end-call').hide(); // Hide the button

    // Show the call button
    $('.call').show();

    // Show the dial pad
    $('.dial-pad').show();

    // Hide the call pad
    $('.call-pad').css('opacity', 0);

    timeCounterCounting = false;
    timeCounter = 0;
    hangUpCall();

    $('.pulsate').toggleClass('active-call');

    $('.phoneString input').val('');
}

// Function to handle the inbound phone call.
function handleIncomingPhoneCall(call) {

    console.log("Inbound phone call from " + call.parameters.From);

    var settings = {
        "url": "https://prairiecrm.com/api/user-information?contact="+call.parameters.From,
        "method": "GET",
        "timeout": 0,
    };

    $.ajax(settings).done(function (response) {
        // console.log(response);
        $('.contact-name').text(response);
    });

    // $('.contact-name').text("Unknown");
    $('.ca-number').text(call.parameters.From);
    $('.contact-number').text(call.parameters.From);
    $('.phoneString input').val('');

    $('.ca-status').text("Calling");

    // Hide the digits container
    $('.digits-container').hide();

    // Hide the call button
    $('.call').hide();

    // Show the incoming call container
    $('.incoming-call-container').show();

    // Show the call pad.
    $('.call-pad').css('opacity', 1);

    $('.pad').css({
        'z-index': '9999',
        'opacity': '1'
    });

    // Listen for the reject call button to be clicked.
    $('.reject-call').on('click', function() {
        rejectIncomingCall(call);
    });

    // Listen for the accept incoming call button to be clicked.
    $('.accept-call').on('click', function() {
        acceptIncomingCall(call);
    });
}

// Function to handle incoming call rejection.
function rejectIncomingCall(call) {
    // Reject the call.
    call.reject();

    console.log("Rejecting incoming phone call");

    // Update the ui.

    // Hide the call pad.
    $('.call-pad').css('opacity', 0);

    // Hide the incoming call container
    $('.incoming-call-container').hide();

    // show the digits container
    $('.digits-container').show();

    // show the call button
    $('.call').show();
}

// Function to accept incoming call
function acceptIncomingCall(call) {
    // Accept the call
    call.accept();

    console.log("Accepted the incoming telephone call");

    // Update the ui.

    // Hide incoming call buttons.
    $('.incoming-call-container').hide();

    // Show end call button.
    $('.end-call').show();

    // Register hangup button listener.
    $('.end-call').on('click', function() {
        hangupTelephoneCall(call);
    })

    // Register mute button listener.
    $('.mute').on('click', function() {
        muteTelephoneCall(call);
    });

    // Register unmute button listener.
    $('.unmute').on('click', function() {
        unmuteTelephoneCall(call);
    });

    setTimeout(function() {
        timeoutTimer = true;
        looper();
        //showActiveCallAfterAFewSeconds
        setTimeout(function() {
            timeoutTimer = false;
            timeCounterCounting = true;
            timeCounterLoop();

            $('.pulsate').toggleClass('active-call');
            $('.ca-status').animate({
                opacity: 0,
            }, 1000, function() {
                $(this).text('00:00');
                $('.ca-status').attr('data-dots', '');

                $('.ca-status').animate({
                    opacity: 1,
                }, 1000);
            });
        }, 500);
    }, 500);
}
