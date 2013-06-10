;jQuery
(
	function($)
	{
		/**
		 * Homepage
		 */

		// Features
		$('div.features3 li:nth-child(3n-2)').addClass('first');
		
		
		/**
		 * Sidebar
		 */
		$('#searchform').parent('div').addClass('searchform');
		
		
		/**
		 * Pricing Grid
		 */
		var $gridSections = $('div.grid div.sections section');
		
		$gridSections.hover
		(
			function()
			{
				$gridSections.removeClass('on');
				$(this).addClass('on');
			}
		);
		
		var setPrice = function() {
			var currentPlan = $.url().param('plan');
			if (currentPlan) {
				$('#plan').val(currentPlan);
			}
			updatePrice();
		}
		
		var updatePrice = function() {
			var billingPeriod = $('#billingPeriod option:selected').val();
			var plan = $('#plan option:selected').val()
			var monthlyPrice = 49;
			var yearlyPrice = 470;
			if (plan === 'Free') {
				monthlyPrice = 0;
				yearlyPrice = 0;
			}
			else if (plan === 'Basic') {
				monthlyPrice = 49;
				yearlyPrice = 470;
			}
			else if (plan === 'Professional') {
				monthlyPrice = 99;
				yearlyPrice = 950;
			}
			else {
				monthlyPrice = 299;
				yearlyPrice = 2870;
			}
			if (billingPeriod === 'Yearly') {
				$('#cost').text('$'+yearlyPrice + '/year');
			}
			else {
				$('#cost').text('$'+monthlyPrice + '/month');
			}
			if (plan === 'Free') {
				$('#ccNumRow').hide();
				$('#ccExpRow').hide();
				$('#ccCVVRow').hide();
			}
			else {
				$('#ccNumRow').show();
				$('#ccExpRow').show();
				$('#ccCVVRow').show();
			}
			$('#error').hide();
		};
		
		$('.priceSelector').change(updatePrice);
		$(document).ready(function() {
			$('#error').hide();
			$('#success').hide();
			setPrice();
		});
		
		function stripeResponseHandler (status, response) {
		  if (response.error) {
			$('#error').show();
		    $('#error').text(response.error.message);
		    $('#error').slideDown(300);
		    $('#stripe-form .submit-button').removeAttr("disabled");
		    return;
		  }
			var form = $("#payment-form");
			console.log('adding:', response.id);
		  	form.append($('<input type="hidden" name="stripeToken" />').val(response.id));
			console.log("form:", form.serialize());
			var body = form.serialize();
			var url = form.attr('action');
			console.log('url', url);
			console.log('body', body);
		  $.post(
		    url,
		    body,
		    function (status) {
		      if (status.split(' ')[0] != 'ok') {
				$('#error').show();
		        $('#error').text(status);
		        $('#error').slideDown(300);
		      }
		      else {
		        $('#error').hide();
				$('#success').show();
		        $('#success').slideDown(300);
				var apiKey = status.split(' ')[1];
				$('#success').text("Thanks for signing up! Your API key is " + apiKey);
		      }
		      $('.submit-button').removeAttr("disabled");
		    }
		  );
		}

		// http://stripe.com/docs/tutorials/forms
		$("#payment-form").submit(function(event) {
			var fields = ['.card-number', '.email-address', '.card-expiry-month', '.card-expiry-year', 'card-cvc'];
			for (var i = 0; i < fields.length; i++) {
				if ($(fields[i]).val() === '' && $(fields[i]).is(':visible')) {
					$('#error').show();
					$('#error').text('Please fill out all fields.');
					return false;
				}
			}
		  $('#error').hide();
		  // disable the submit button to prevent repeated clicks
		  $('.submit-button').attr("disabled", "disabled");
		
		if ($('#plan').val() === "Free") {
			stripeResponseHandler('ok', {id: 0});
			return false;
		}

		  Stripe.createToken({
		    number: $('.card-number').val(),
		    cvc: $('.card-cvc').val(),
		    exp_month: $('.card-expiry-month').val(),
		    exp_year: $('.card-expiry-year').val()
		  }, stripeResponseHandler);

		  // prevent the form from submitting with the default action
		  return false;
		});
	}
);