// This is for the moustache-like templates
// prevents collisions with JSP tags
_.templateSettings = {
	interpolate : /\{\{(.+?)\}\}/g
};
$('#oncoprint_controls').html(_.template($('#main-controls-template').html())());
$('#oncoprint').css('position','relative');

var oncoprintFadeTo;
var oncoprintFadeIn;
var oncoprint;
var genetic_alteration_tracks = [];
var clinical_tracks = [];
var clinical_legends_visible = false;

(function () {
	var oncoprint_covering_block = $('<div>').appendTo('#oncoprint');;
	oncoprint_covering_block.css({'position':'absolute', 'left':'0px', 'top': '0px', 'display':'none'});
	
	oncoprintFadeTo = function(f) {
		oncoprint_covering_block.css({'display':'block', 'width':$('#oncoprint').width()+'px', 'height':$('#oncoprint').height()+'px'});
		return $.when($('#oncoprint').fadeTo('fast', f));
	};
	oncoprintFadeIn = function() {
		oncoprint_covering_block.css('display','none');
		return $.when($('#oncoprint').fadeTo('fast', 1));
	}
}());

var setUpToolbarBtnHover = function($elt) {
	$elt.hover(function() {
		$(this).css({'fill':'#0000FF',
			'font-size': '18px',
			'cursor': 'pointer'});
		},
		function () {
			$(this).css({'fill': '#87CEFA',
				'font-size': '12px'});
		});
};
var genetic_alteration_tooltip = function(d, sample_data) {
	var ret = '';
	if (d.mutation) {
		ret += 'Mutation: <b>' + d.mutation + '</b><br>';
	}
	if (d.cna) {
		ret += 'Copy Number Alteration: <b>' + d.cna + '</b><br>';
	}
	if (d.mrna) {
		ret += '<b>MRNA: <b>' + d.mrna + '</b><br>';
	}
	if (d.rppa) {
		ret += '<b>RPPA: <b>' + d.rppa + '</b><br>';
	}
	if (sample_data) {
		ret += '<a href="'+sampleViewUrl(d.sample)+'">'+d.sample+'</a>';
	} else {
		ret += '<a href="'+patientViewUrl(d.patient)+'">'+d.patient+'</a>';
	}
	return ret;
};
var genetic_alteration_tooltip_sample = function(d) { 
	return genetic_alteration_tooltip(d, true);
};
var genetic_alteration_tooltip_patient = function(d) { 
	return genetic_alteration_tooltip(d, false);
};

var clinical_tooltip_sample = function(d) {
	var ret = '';
	ret += 'value: <b>'+d.attr_val+'</b><br>'
	ret += '<a href="'+sampleViewUrl(d.sample)+'">'+d.sample+'</a>';
	return ret;
};
var clinical_tooltip_patient = function(d) {
	var ret = '';
	ret += 'There are <b>'+d.num_samples+'</b> samples<br>';
	if (d.value_counts) {
		_.each(d.value_counts, function(count, value) {
			ret += '<b>'+value+': '+count+'</b><br>';
		});
	} else {
		ret += 'value: <b>'+d.attr_val+'</b><br>';
	}
	ret += '<a href="'+patientViewUrl(d.patient)+'">'+d.patient+'</a>';
	return ret;
};

var utils = window.OncoprintUtils;

var sampleViewUrl = function(sample_id) {
        var href = cbio.util.getLinkToSampleView(window.cancer_study_id_selected,sample_id);
	return href;
};
var patientViewUrl = function(patient_id) {
        var href = cbio.util.getLinkToPatientView(window.cancer_study_id_selected, patient_id);
	return href;
};

var setupOncoprint = function(container_selector_string, cancer_study_id, oql, cases, genetic_profile_ids, z_score_threshold, rppa_score_threshold) {
	var geneDataColl = new GeneDataColl();
	oncoprint = window.oncoprint = window.Oncoprint.create(container_selector_string);
	oncoprint.setTrackGroupSortOrder([1,0]);
	
	var sampleGeneData = {};
	var patientGeneData = {};
	var sampleClinicalData = {};
	var patientClinicalData = {};
	var sampleIdToPatientId = PortalGlobals.getPatientSampleIdMap();
	
	var sample_data = false;
	window.patientClinicalData = patientClinicalData;
	window.patientGeneData = patientGeneData;
	window.sampleGeneData = sampleGeneData;
	window.sampleClinicalData = sampleClinicalData;
	var trackKey = {};
	
	var sampleGeneDataToPatientData = (function() {
		var sampleToPatientId = PortalGlobals.getPatientSampleIdMap();
		
		return function(data) {
			var ret = {};
			// TEMPORARY: just use an arbitrary sample. TODO: fix this properly
			_.each(data, function(d) {
				if (d.hasOwnProperty('mut_type')) {
					var BREAK;
				}
				var new_datum = $.extend(true, {}, d);
				var patient_id = sampleToPatientId[d.sample];
				ret[patient_id] = new_datum;
				delete new_datum['sample'];
				new_datum.patient = patient_id;
			});
			return _.map(Object.keys(ret), function(k) { return ret[k];});
		}
	})();
	var sampleClinicalDataToPatientData = (function() {
		
		return function(data, aggregation_method) {
			var ret = {};
			if (aggregation_method === 'category') {
				_.each(data, function(d) {
					var patient_id = sampleIdToPatientId[d.sample];
					ret[patient_id] = ret[patient_id] || {'patient': patient_id, attr_id: d.attr_id, 'value_counts':{}, 'num_samples':0};
					ret[patient_id]['num_samples'] += 1;
					var value_counts = ret[patient_id]['value_counts'];
					var attr_val = d.attr_val;
					value_counts[attr_val] = value_counts[attr_val] || 0;
					value_counts[attr_val] += 1;
					ret[patient_id].attr_val = Object.keys(value_counts).length > 1 ? 'Mixed' : d.attr_val;
				});
			} else if (aggregation_method === 'average') {
				_.each(data, function(d) {
					var patient_id = sampleIdToPatientId[d.sample];
					ret[patient_id] = ret[patient_id] || {'patient': patient_id, attr_id: d.attr_id, 'attr_val':0, 'num_samples':0};
					ret[patient_id]['num_samples'] += 1;
					ret[patient_id]['attr_val'] += d.attr_val;
				});
				_.each(ret, function(datum, k) {
					datum.attr_val /= datum.num_samples;
				});
			}
			return _.map(Object.keys(ret), function(k) { return ret[k];});
		}
	})();
	function findIndexInArray(elementValue, arrayValue, patientMap)
	{
		for (var i = 0; i < arrayValue.length; i++)
		{
			if (patientMap[elementValue] === arrayValue[i])
			{
				return i;
			}
		}

		return -1;
	}
	function calculatePatientNum(samples, patientsMap)
	{
		var PatientsList = [];
		samples = samples.split(" ");
		for (var i = 0; i < samples.length; i++)
		{
			if (patientsMap[samples[i]] !== undefined)
			{
				if (findIndexInArray(samples[i], PatientsList, patientsMap) === -1)
				{
					PatientsList.push(patientsMap[samples[i]]);
				}
			}
		}

		return PatientsList.sort();
	}
	geneDataColl.fetch({
		type: "POST",
		data: {
			cancer_study_id: cancer_study_id,
			oql: oql,
			case_list: cases,
			geneticProfileIds: genetic_profile_ids,
			z_score_threshold: z_score_threshold,
			rppa_score_threshold: rppa_score_threshold
		},
		success: function(response) {
			var genes = {};
			_.each(response.models, function(d) {
				genes[d.attributes.gene] = true;
			});
			genes = Object.keys(genes);
			(function invokeDataManager() {
				window.PortalGlobals.setGeneData(geneDataColl.toJSON());
				window.PortalDataColl.setOncoprintData(utils.process_data(response.toJSON(), genes));
				PortalDataColl.setOncoprintStat(utils.alteration_info(geneDataColl.toJSON()));
			})();
			_.each(response.models, function(d) {
				var gene = d.attributes.gene;
				sampleGeneData[gene] = sampleGeneData[gene] || [];
				sampleGeneData[gene].push(d.attributes);
			});
			_.each(sampleGeneData, function(data, gene) {
				patientGeneData[gene] = annotateMutationTypes(sampleGeneDataToPatientData(data));
				sampleGeneData[gene] = annotateMutationTypes(data);
			});
			
			var track_created = false;
			oncoprint.suppressRendering();
			var numDataPts = _.reduce(_.map(Object.keys(sampleGeneData), function(gene) {
				return sampleGeneData[gene].length;
			}), function(a,b) { return a+b;}, 0);
			var numDataPtsAdded = 0;
			$('#outer_loader_img').hide();
			var updateProgressIndicator = function(done_adding) {
				if (done_adding) {
					document.getElementById('oncoprint_progress_indicator_text').innerHTML = "Rendering...";
					document.getElementById('oncoprint_progress_indicator_rect').setAttribute('width', '200px');
					document.getElementById('oncoprint_progress_indicator_rect').setAttribute('fill','#00ff00');
				} else {
					document.getElementById('oncoprint_progress_indicator_text').innerHTML = "Adding data points..";
					document.getElementById('oncoprint_progress_indicator_rect').setAttribute('width', Math.ceil(200*numDataPtsAdded/numDataPts)+'px');
				}
			};
			updateProgressIndicator();
			var geneIndex = 0;
			var addGeneData = function(gene) {
				// We do it like this, recursive and with setTimeouts, because we want the browser to
				//	render the progress message, and if we do this in a loop or do a recursive call
				//	in the same thread, then the browser doesn't actually do the rendering. We need
				//	to force it to render by putting the recursive call on the back of the execution queue.
				var _data = patientGeneData[gene];
				var new_track = oncoprint.addTrack({label: gene, tooltip: genetic_alteration_tooltip_patient});
				trackKey[new_track] = gene;
				if (track_created === false) {
					oncoprint.setRuleSet(new_track, window.Oncoprint.GENETIC_ALTERATION);
					track_created = new_track;
				} else {
					oncoprint.useSameRuleSet(new_track, track_created);
				}
				genetic_alteration_tracks.push(new_track);
				oncoprint.setTrackData(new_track, _data);
				numDataPtsAdded += _data.length;
				updateProgressIndicator();
				geneIndex += 1;
				if (geneIndex < genes.length) {
					setTimeout(function() {
						addGeneData(genes[geneIndex]);
					}, 0);
				} else {
					updateProgressIndicator(true);
					setTimeout(function() {
						oncoprint.releaseRendering();
						$('#oncoprint #everything').show();
						$('#oncoprint_progress_indicator').hide();
						oncoprint.setSortConfig({type:'track'});
						oncoprint.sort();
					}, 0);
				};
			}
			addGeneData(genes[geneIndex]);
		}
	});
	
	(function setUpZoom() {
		var zoom_elt = $('#oncoprint_whole_body #oncoprint_diagram_slider_icon');
		var slider = $('<input>', {
						id: "oncoprint_zoom_slider",
						type: "range",
						width: "80",
						height: "16",
						min: 0,
						max: 1,
						step: 0.01,
						value: 1,
						change: function() {
							oncoprint.setZoom(this.value);
						}
					});
		zoom_elt.append(slider);
		setUpToolbarBtnHover(slider);
		slider.qtip({
			content: {text: 'Zoom in/out of oncoprint'},
			position: {my:'bottom middle', at:'top middle', viewport: $(window)},
			style: { classes: 'qtip-light qtip-rounded qtip-shadow qtip-lightwhite' },
			show: {event: "mouseover"},
			hide: {fixed: true, delay: 100, event: "mouseout"}
		});
		var zoomStep = 0.05;
		$('#oncoprint_whole_body #oncoprint_zoomout').click(function () {
			var slider = $('#oncoprint_whole_body #oncoprint_zoom_slider')[0];
			var currentZoom = parseFloat(slider.value);
			var newZoom = currentZoom - zoomStep;
			slider.value = Math.max(0, newZoom);
			$(slider).trigger('change');
		});
		$('#oncoprint_whole_body #oncoprint_zoomin').click(function () {
			var slider = $('#oncoprint_whole_body #oncoprint_zoom_slider')[0];
			var currentZoom = parseFloat(slider.value);
			var newZoom = currentZoom + zoomStep;
			slider.value = Math.min(1, newZoom);
			$(slider).trigger('change');
		});
	})();
	
	(function setUpToggleWhitespaceBtn() {
		var btn = $('#oncoprint-diagram-removeWhitespace-icon');
		var btn_img = $('#oncoprint-diagram-removeWhitespace-icon img')[0];
		var img_urls = ['images/removeWhitespace.svg', 'images/unremoveWhitespace.svg'];
		var curr_img_url_index = 0;
		btn.click(function() {
			oncoprint.toggleCellPadding();
			curr_img_url_index = +!curr_img_url_index;
			btn_img.attributes.src.value = img_urls[curr_img_url_index];
		});
		setUpToolbarBtnHover(btn);
		btn.qtip({
		content: {text: function() {
				if (curr_img_url_index === 0) {
					return "Remove whitespace between columns";
				} else {
					return "Show whitespace between columns";
				}
			}},
			position: {my: 'bottom middle', at: 'top middle', viewport: $(window)},
			style: {classes: 'qtip-light qtip-rounded qtip-shadow qtip-lightwhite'},
			show: {event: "mouseover"},
			hide: {fixed: true, delay: 100, event: "mouseout"}
		});   
	})();
	
	var unaltered_cases_hidden = false;
	var hideUnalteredIds = function() {
		var unaltered_ids = oncoprint.getFilteredIdOrder(function(d_list) {
			return _.filter(d_list, function(d) {
				// unaltered gene data iff only keys are gene, sample/patient
				return Object.keys(d).length > 2;
			}).length === 0;
		}, genetic_alteration_tracks);
		oncoprint.hideIds(unaltered_ids, true);
	};
	(function setUpRemoveUnalteredCasesBtn() {
		var btn = $('#oncoprint-diagram-removeUCases-icon');
		var imgs = ['images/removeUCases.svg', 'images/unremoveUCases.svg'];
		var descs = ['Hide unaltered cases', 'Show unaltered cases'];
		btn.click(function() {
			unaltered_cases_hidden = !unaltered_cases_hidden;
			btn.find('img').attr('src', imgs[+unaltered_cases_hidden]);
			if (!unaltered_cases_hidden) {
				oncoprint.showIds();
			} else {
				hideUnalteredIds();
			}
		});
		btn.qtip({
			content: {text: function() {
					return descs[+unaltered_cases_hidden];
				}},
			position: {my:'bottom middle', at:'top middle', viewport: $(window)},
			style: { classes: 'qtip-light qtip-rounded qtip-shadow qtip-lightwhite' },
			show: {event: "mouseover"},
			hide: {fixed: true, delay: 100, event: "mouseout"}
		});
	})();
	(function setUpTogglePatientSampleBtn() {
		var toolbar_btn = $('#oncoprint_diagram_topatientid_icon');
		var header_btn = $('#switchPatientSample');
		var imgs = ['images/cool2.svg', 'images/cool.svg'];
		var toolbar_descs = ['Show events per sample', 'Show events per patient'];
		var header_descs = ['Show samples in OncoPrint', 'Show patients in OncoPrint'];
		toolbar_btn.add(header_btn).click(function() {
			sample_data = !sample_data;
			toolbar_btn.find('img').attr('src', imgs[+sample_data]);
			header_btn.text(header_descs[+sample_data]);
			//oncoprint.suppressRendering();
			oncoprintFadeTo(0.5).then(function() {
				if (!sample_data) {
					//oncoprint.clearData();
					oncoprint.setIdOrder([]);
					_.each(genetic_alteration_tracks, function(track_id) {
						oncoprint.setTrackDatumIdKey(track_id, 'patient');
						oncoprint.setTrackTooltip(track_id, genetic_alteration_tooltip_patient);
						oncoprint.setTrackData(track_id, patientGeneData[trackKey[track_id]]);
					});
					_.each(clinical_tracks, function(track_id) {
						oncoprint.setTrackDatumIdKey(track_id, 'patient');
						oncoprint.setTrackTooltip(track_id, clinical_tooltip_patient);
						oncoprint.setTrackData(track_id, patientClinicalData[trackKey[track_id]]);
					});
					var AlteredPatientsNum = calculatePatientNum(PortalGlobals.getAlteredSampleIdList(), PortalGlobals.getPatientSampleIdMap());
					var UnalteredPatientsNum = calculatePatientNum(PortalGlobals.getUnalteredSampleIdList(), PortalGlobals.getPatientSampleIdMap());

					var totalPatientsNum = _.union(AlteredPatientsNum, UnalteredPatientsNum);
					var percentOfAlteredPatients = Math.ceil((AlteredPatientsNum.length / totalPatientsNum.length * 100).toFixed(1));

					$('#altered_value').text("Altered in " + AlteredPatientsNum.length + " (" + percentOfAlteredPatients + "%) of " + totalPatientsNum.length + " cases/patients");
					$('.oncoprint-sample-download').text("Patient order");
				} else {
					//oncoprint.clearData();
					oncoprint.setIdOrder([]);
					_.each(genetic_alteration_tracks, function(track_id) {
						oncoprint.setTrackDatumIdKey(track_id, 'sample');
						oncoprint.setTrackTooltip(track_id, genetic_alteration_tooltip_sample);
						oncoprint.setTrackData(track_id, sampleGeneData[trackKey[track_id]]);
					});
					_.each(clinical_tracks, function(track_id) {
						oncoprint.setTrackDatumIdKey(track_id, 'sample');
						oncoprint.setTrackTooltip(track_id, clinical_tooltip_sample);
						oncoprint.setTrackData(track_id, sampleClinicalData[trackKey[track_id]]);
					});
					$('#altered_value').text("Altered in "+ PortalGlobals.getNumOfAlteredCases() + " ("+ Math.ceil(PortalGlobals.getPercentageOfAlteredCases()) +"%) of "+ PortalGlobals.getNumOfTotalCases() + " samples");
					$('.oncoprint-sample-download').text("Sample order");
				}
				if (unaltered_cases_hidden) {
					hideUnalteredIds();
				}
				oncoprint.sort();
				oncoprintFadeIn();
			});
			//oncoprint.releaseRendering();
		});
		toolbar_btn.qtip({
			content: {text: function() {
					return toolbar_descs[+sample_data];
				}},
			position: {my:'bottom middle', at:'top middle', viewport: $(window)},
			style: { classes: 'qtip-light qtip-rounded qtip-shadow qtip-lightwhite' },
			show: {event: "mouseover"},
			hide: {fixed: true, delay: 100, event: "mouseout"}
		});
	})();
	(function setUpClinicalAttributesSelector(cancer_study_id, case_list) {
	var clinicalAttributesColl = new ClinicalAttributesColl();
	var clinicalAttributes;
	var currentClinicalAttributes;
	var clinicalTrackToAttribute = {};
	var populateSelectorChosen = function() {
		utils.populate_clinical_attr_select(document.getElementById('select_clinical_attributes'), currentClinicalAttributes);
		$("#select_clinical_attributes").val('').trigger("liszt:updated");
	};
	clinicalAttributesColl.fetch({
		type: 'POST',
		data: { cancer_study_id: cancer_study_id,
			case_list: case_list 
		},
		success: function(attrs) {
			clinicalAttributes = attrs.toJSON();
			clinicalAttributes = _.sortBy(clinicalAttributes, function(o) { return o.display_name; })
			if(window.PortalGlobals.getMutationProfileId()!==null){
			    clinicalAttributes.unshift({attr_id: "# mutations", 
							datatype: "NUMBER",
							description: "Number of mutations", 
							display_name: "# mutations",
						});
			}

			if(window.PortalGlobals.getCancerStudyId()!==null){
			    clinicalAttributes.unshift({attr_id: "FRACTION_GENOME_ALTERED", 
							datatype: "NUMBER",
							description: "Fraction Genome Altered", 
							display_name: "Fraction Genome Altered"
						});
			}

			currentClinicalAttributes = clinicalAttributes.slice();
			for (var i=0, _len = currentClinicalAttributes.length; i<_len; i++) {
				currentClinicalAttributes[i].display_order = i;
			}
			populateSelectorChosen();
			$('#select_clinical_attributes').chosen({width: "330px", "font-size": "12px", search_contains: true});

			$('#select_clinical_attributes_chzn .chzn-search input').click(
			    function(e){
				e.stopPropagation();
			    }
			);

			$("#select_clinical_attributes_chzn").mouseenter(function() {
			    $("#select_clinical_attributes_chzn .chzn-search input").focus();
			});
			$("#select_clinical_attributes_chzn").addClass("chzn-with-drop");
		}
	});
	
	$(oncoprint).on('remove_track.oncoprint', function(evt, data) {
		var attr = clinicalTrackToAttribute[data.track_id];
		delete clinicalTrackToAttribute[data.track_id];
		delete trackKey[data.track_id];
		clinical_tracks.splice(clinical_tracks.indexOf(data.track_id), 1);
		currentClinicalAttributes.push(attr);
		currentClinicalAttributes = _.sortBy(currentClinicalAttributes, function(o) { return o.display_order; });
		if (Object.keys(clinicalTrackToAttribute).length === 0) {
			$('#oncoprint-diagram-showlegend-icon').css('display','none');
		}
		populateSelectorChosen();
	});
	var addClinicalTrack = function(clinical_attr) {
		var new_track;
		if (clinical_attr.attr_id === "# mutations") {
			var mutation_count_data = (sample_data ? sampleClinicalData : patientClinicalData)[clinical_attr.attr_id];
			new_track = oncoprint.addTrack({label: '# Mutations (Log scale)', tooltip: (sample_data ? clinical_tooltip_sample : clinical_tooltip_patient), cell_height: 15.33, removable: true, sort_direction_changable: true, datum_id_key: (sample_data ? "sample" : "patient")}, 0);
			oncoprint.setRuleSet(new_track, window.Oncoprint.BAR_CHART, {
				data_key: 'attr_val',
				fill: '#c97894',
				legend_label: '# Mutations',
				scale: 'log',
				na_color: '#d3d3d3'
			});
			oncoprint.setTrackData(new_track, mutation_count_data);
			oncoprint.sort();
		} else {
			var data = (sample_data ? sampleClinicalData : patientClinicalData)[clinical_attr.attr_id];
			var new_track = oncoprint.addTrack({label:clinical_attr.display_name, tooltip: (sample_data ? clinical_tooltip_sample : clinical_tooltip_patient), cell_height: 15.33, removable: true, sort_direction_changable: true, datum_id_key: (sample_data ? "sample" : "patient")}, 0);
			if (clinical_attr.datatype.toLowerCase() === "number") {	
				oncoprint.setRuleSet(new_track, window.Oncoprint.GRADIENT_COLOR, {
					data_key: 'attr_val',
					color_range: ['#ffffff', '#c97894'],
					legend_label: clinical_attr.display_name,
					na_color: '#d3d3d3'
				});
			} else {
				oncoprint.setRuleSet(new_track, window.Oncoprint.CATEGORICAL_COLOR, {
					legend_label: clinical_attr.display_name,
					getCategory: function(d) {
						return d.attr_val;
					},
					color: {
						'NA': '#D3D3D3'
					},
				});
			}
			oncoprint.setTrackData(new_track, data);
			oncoprint.sort();
		}
		var attr_index = _.indexOf(_.pluck(currentClinicalAttributes, 'attr_id'), clinical_attr.attr_id);
		currentClinicalAttributes.splice(attr_index, 1);
		
		populateSelectorChosen();
		
		clinical_tracks.push(new_track);
		clinicalTrackToAttribute[new_track] = clinical_attr;
		trackKey[new_track] = clinical_attr.attr_id;
		oncoprint.setLegendVisible(new_track, clinical_legends_visible);
	};
	
	$('#oncoprint_diagram_showmorefeatures_icon').qtip({
                        content: {text:'Add another clinical attribute track'},
                        position: {my:'bottom middle', at:'top middle', viewport: $(window)},
                        style: { classes: 'qtip-light qtip-rounded qtip-shadow qtip-lightwhite' },
                        show: {event: "mouseover"},
                        hide: {fixed: true, delay: 100, event: "mouseout"}
	});
	$('#oncoprint_diagram_showmorefeatures_icon').click(function(){
            $('#select_clinical_attributes_chzn').addClass("chzn-with-drop");
        });
	$("#select_clinical_attributes_chzn").mouseenter(function() {
		$("#select_clinical_attributes_chzn .chzn-search input").focus();
	});
	$('#select_clinical_attributes').change(function() {
		oncoprintFadeTo(0.5);
		$(oncoprint).one('finished_rendering.oncoprint', function() {
			$('#oncoprint-diagram-toolbar-buttons #clinical_first').css('display','inline');
			$('#oncoprint-diagram-showlegend-icon').css('display','inline');
			oncoprintFadeIn();
		});
		var clinicalAttribute = $('#select_clinical_attributes option:selected')[0].__data__;
		$('#select_clinical_attributes').val('').trigger('liszt:updated');
		$('#clinical_dropdown').dropdown( 'toggle' );
		if (clinicalAttribute.attr_id === undefined) {
			// selected "none"
		} else {
			if (sampleClinicalData.hasOwnProperty(clinicalAttribute.attr_id)) {
				addClinicalTrack(clinicalAttribute);
			} else {
				if (clinicalAttribute.attr_id === "# mutations") {
					var clinicalMutationColl = new ClinicalMutationColl();
					clinicalMutationColl.fetch({
						type: "POST",
						data: {
							mutation_profile: window.PortalGlobals.getMutationProfileId(),
							cmd: "count_mutations",
							case_ids: case_list
						},
						success: function(response) {
							sampleClinicalData[clinicalAttribute.attr_id] = addBlankDataToClinicalData(response.toJSON(), clinicalAttribute.attr_id, 'sample', case_list.trim().split(/\s+/));
							patientClinicalData[clinicalAttribute.attr_id] = sampleClinicalDataToPatientData(sampleClinicalData[clinicalAttribute.attr_id], 'average');
							addClinicalTrack(clinicalAttribute);
						}
					});
				} else if (clinicalAttribute.attr_id === "FRACTION_GENOME_ALTERED") {
					var clinicalCNAColl = new ClinicalCNAColl();
					clinicalCNAColl.fetch({
						type: "POST",
						data: {
							cancer_study_id: cancer_study_id,
							cmd: "get_cna_fraction",
							case_ids: case_list
						},
						success: function(response) {
							sampleClinicalData[clinicalAttribute.attr_id] = addBlankDataToClinicalData(response.toJSON(), clinicalAttribute.attr_id, 'sample', case_list.trim().split(/\s+/));
							patientClinicalData[clinicalAttribute.attr_id] = sampleClinicalDataToPatientData(sampleClinicalData[clinicalAttribute.attr_id], 'average');
							addClinicalTrack(clinicalAttribute);
						}
					});
				} else {
					var clinicalColl = new ClinicalColl();
					clinicalColl.fetch({
						type: "POST",
						data: {
							cancer_study_id: cancer_study_id,
							attribute_id: clinicalAttribute.attr_id,
							case_list: case_list
						},
						success: function(response) {
							sampleClinicalData[clinicalAttribute.attr_id] = addBlankDataToClinicalData(response.toJSON(), clinicalAttribute.attr_id, 'sample', case_list.trim().split(/\s+/));
							patientClinicalData[clinicalAttribute.attr_id] = sampleClinicalDataToPatientData(sampleClinicalData[clinicalAttribute.attr_id], 'category');
							addClinicalTrack(clinicalAttribute);
						}
					});
				}
			}
		}
	});
	})(cancer_study_id_selected, window.PortalGlobals.getCases());

	(function setUpShowLegendBtn() {
		var imgs = ['images/showlegend.svg', 'images/hidelegend.svg'];
		var qtip_text = ['Show legends for clinical attribute tracks', 'Hide legends for clinical attribute tracks'];
		$('#oncoprint-diagram-showlegend-icon').click(function() {
			clinical_legends_visible = !clinical_legends_visible;
			$('#oncoprint-diagram-showlegend-icon img').attr('src', imgs[+clinical_legends_visible]);
			oncoprint.setLegendVisible(clinical_tracks, clinical_legends_visible);	
		});
		$('#oncoprint-diagram-showlegend-icon').qtip({
		    content: {
			    text:function() {
				    return qtip_text[+clinical_legends_visible];
			    }
		    },
		    position: {my:'bottom middle', at:'top middle', viewport: $(window)},
		    style: { classes: 'qtip-light qtip-rounded qtip-shadow qtip-lightwhite' },
		    show: {event: "mouseover"},
		    hide: {fixed: true, delay: 100, event: "mouseout"}
		}); 
		setUpToolbarBtnHover($('#oncoprint-diagram-showlegend-icon'));
	})();
	(function setUpSortBySelector(cases) {
		$('#oncoprint-diagram-toolbar-buttons #genes_first_a').click(function(){
			oncoprint.setTrackGroupSortOrder([1,0]);
			oncoprint.setSortConfig({type: 'track'});
			oncoprint.sort();
		});
		$('#oncoprint-diagram-toolbar-buttons #clinical_first_a').click(function(){
			oncoprint.setTrackGroupSortOrder([0,1]);
			oncoprint.setSortConfig({type: 'track'});
			oncoprint.sort();
		});
		$('#oncoprint-diagram-toolbar-buttons #alphabetically_first_a').click(function(){
			oncoprint.setSortConfig({type: 'id'});
			oncoprint.sort();
		});
		$('#oncoprint-diagram-toolbar-buttons #user_defined_first_a').click(function(){
			oncoprint.setIdOrder(cases.trim().split(/\s+/));
			oncoprint.setSortConfig({});
		});
	})(window.PortalGlobals.getCases());

	(function setUpMutationSettingsBtn() {
		// TODO: are we aware that these icon names are 100% unintelligible?
		var settings = [{color: true, order: false, next_setting_img:'images/colormutations.svg', next_setting_desc: 'Color-code mutations and sort by type'},  
				{color:true, order: true, next_setting_img:'images/uncolormutations.svg', next_setting_desc: 'Show all mutations with the same color'},
				{color:false, order: false, next_setting_img:'images/mutationcolorsort.svg', next_setting_desc: 'Color-code mutations but don\'t sort by type'}];
		var setting_index = 0;
		var updateBtn = function() {
			$('#oncoprint_diagram_showmutationcolor_icon').qtip('destroy', true);
			$('#oncoprint_diagram_showmutationcolor_icon img').attr('src', settings[setting_index].next_setting_img);
			$('#oncoprint_diagram_showmutationcolor_icon').qtip({
				content: {text: settings[setting_index].next_setting_desc},
				position: {my:'bottom middle', at:'top middle', viewport: $(window)},
				style: { classes: 'qtip-light qtip-rounded qtip-shadow qtip-lightwhite' },
				show: {event: "mouseover"},
				hide: {fixed: true, delay: 100, event: "mouseout"}
			}); 
		};
		$('#oncoprint_diagram_showmutationcolor_icon').click(function() {
			setting_index = (setting_index + 1) % settings.length;
			var new_params = {dont_distinguish_mutation_color: !settings[setting_index].color, distinguish_mutation_order: settings[setting_index].order};
			_.each(genetic_alteration_tracks, function(track_id, ind) {
				if (ind === 0) {
					oncoprint.setRuleSet(track_id, window.Oncoprint.GENETIC_ALTERATION, new_params);
				} else {
					oncoprint.useSameRuleSet(track_id, genetic_alteration_tracks[0]);
				}
			});
			updateBtn();
			oncoprint.sort();
		});
		updateBtn();
		setUpToolbarBtnHover($('#oncoprint_diagram_showmutationcolor_icon'));
	})();
	
	(function setUpDownloadBtn() {
		$('#oncoprint-diagram-downloads-icon').qtip({
			//id: "#oncoprint-diagram-downloads-icon-qtip",
			style: {classes: 'qtip-light qtip-rounded qtip-shadow qtip-lightwhite'},
			show: {event: "mouseover"},
			hide: {fixed: true, delay: 100, event: "mouseout"},
			position: {my: 'top center', at: 'bottom center', viewport: $(window)},
			content: {
				text: "<button class='oncoprint-diagram-download' type='pdf' style='cursor:pointer;width:90px;'>PDF</button> <br/>" +
					"<button class='oncoprint-diagram-download' type='svg' style='cursor:pointer;width:90px;'>SVG</button> <br/>" +
					"<button class='oncoprint-sample-download'  type='txt' style='cursor:pointer;width:90px;'>Patient order</button>"
			},
			events: {
				render: function (event) {
					$('.oncoprint-diagram-download').click(function () {
						var fileType = $(this).attr("type");
						if (fileType === 'pdf')
						{
							var downloadOptions = {
								filename: "oncoprint.pdf",
								contentType: "application/pdf",
								servletName: "svgtopdf.do"
							};

							cbio.download.initDownload(oncoprint.toSVG(), downloadOptions);
						}
						else if (fileType === 'svg')
						{
							cbio.download.initDownload(oncoprint.toSVG(), {filename: "oncoprint.svg"});
						}
					});

					$('.oncoprint-sample-download').click(function () {
						var idTypeStr = (sample_data ? "Sample" : "Patient");
						var content = idTypeStr + " order in the Oncoprint is: \n";
						content += oncoprint.getVisibleIdOrder().join('\n');
						var downloadOpts = {
							filename: 'OncoPrint'+idTypeStr+'s.txt',
							contentType: "text/plain;charset=utf-8",
							preProcess: false};

						// send download request with filename & file content info
						cbio.download.initDownload(content, downloadOpts);
					});
				}
			}
		});
	})();

	
	$('#oncoprint_whole_body').hover(function() {
		$("#oncoprint-diagram-toolbar-buttons").stop().fadeTo(80, 1);
	}, function() {
		$("#oncoprint-diagram-toolbar-buttons").stop().fadeOut(500);
	});
	
	var AlteredPatientsNum = calculatePatientNum(PortalGlobals.getAlteredSampleIdList(), PortalGlobals.getPatientSampleIdMap());
	var UnalteredPatientsNum = calculatePatientNum(PortalGlobals.getUnalteredSampleIdList(), PortalGlobals.getPatientSampleIdMap());

	var totalPatientsNum = _.union(AlteredPatientsNum, UnalteredPatientsNum);
	var percentOfAlteredPatients = Math.ceil((AlteredPatientsNum.length / totalPatientsNum.length * 100).toFixed(1));

	$('#altered_value').text("Altered in " + AlteredPatientsNum.length + " (" + percentOfAlteredPatients + "%) of " + totalPatientsNum.length + " cases/patients");
}

var annotateMutationTypes = function(data) {
	var ret = _.map(data, function(d) {
		if (d.mutation) {
			var mutations = d.mutation.split(",");
			var hasIndel = false;
			if (mutations.length > 1) {
				for (var i=0, _len = mutations.length; i<_len; i++) {
					if (/\bfusion\b/i.test(mutations[i])) {
						d.mut_type = 'FUSION';
					} else if(!(/^[A-z]([0-9]+)[A-z]$/g).test(mutations[i])) {
						d.mut_type = 'TRUNC';
					} else if ((/^([A-Z]+)([0-9]+)((del)|(ins))$/g).test(mutations[i])) {
						hasIndel = true;
                                        }
				}
				d.mut_type = d.mut_type || (hasIndel ? 'INFRAME' : 'MISSENSE');
			} else {
				if (/\bfusion\b/i.test(mutations)) {
					d.mut_type = 'FUSION';
				} else if((/^[A-z]([0-9]+)[A-z]$/g).test(mutations)) {
					d.mut_type = 'MISSENSE';
				} else if((/^([A-Z]+)([0-9]+)((del)|(ins))$/g).test(mutations)) {
					d.mut_type = 'INFRAME';
				} else {
					d.mut_type = 'TRUNC';
				}
			}
		}
		return d;
	});
	return ret;
};

var annotatePatientIds = function(data) {
	var sampleToPatientId = PortalGlobals.getPatientSampleIdMap();
	return _.map(data, function(d) {
		d.patient = sampleToPatientId[d.sample];
		return d;
	});
};

var addBlankDataToClinicalData = function(data, attr_id, id_key, ids) {
	var ret = data.slice();
	var seen = {};
	_.each(ids, function(id) {
		seen[id] = false;
	});
	_.each(data, function(d) {
		seen[d[id_key]] = true;
	});
	_.each(seen, function(val, id) {
		if (!val) {
			var new_datum = {attr_id: attr_id, attr_val: 'NA'};
			new_datum[id_key] = id;
			ret.push(new_datum);
		}
	});
	return ret;
};

setupOncoprint('#oncoprint_body', 
		cancer_study_id_selected, 
		$('#gene_list').val(), 
		window.PortalGlobals.getCases(), 
		window.PortalGlobals.getGeneticProfiles(), 
		window.PortalGlobals.getZscoreThreshold(),
		window.PortalGlobals.getRppaScoreThreshold()
		);

