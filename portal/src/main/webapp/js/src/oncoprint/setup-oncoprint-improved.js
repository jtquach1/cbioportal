var utils = window.OncoprintUtils;
function setUpOncoprint(ctr_id, config) {
	var ctr_selector = '#' + ctr_id;
	var oncoprintFadeTo, oncoprintFadeIn;
	var sampleViewUrl, patientViewUrl;
	
	var sample_to_patient = config.sample_to_patient;
	var gene_data = config.gene_data;
	
	var genetic_alteration_tracks = [];
	var clinical_tracks = [];
	
	var splitIdString = function(str) {
		return str.split(/\s+/);
	};
	var annotateMutationTypes = function(data) {
		var ret = _.map(data, function (d) {
			if (d.mutation) {
				var mutations = d.mutation.split(",");
				var hasIndel = false;
				if (mutations.length > 1) {
					for (var i = 0, _len = mutations.length; i < _len; i++) {
						if (/\bfusion\b/i.test(mutations[i])) {
							d.mut_type = 'FUSION';
						} else if (!(/^[A-z]([0-9]+)[A-z]$/g).test(mutations[i])) {
							d.mut_type = 'TRUNC';
						} else if ((/^([A-Z]+)([0-9]+)((del)|(ins))$/g).test(mutations[i])) {
							hasIndel = true;
						}
					}
					d.mut_type = d.mut_type || (hasIndel ? 'INFRAME' : 'MISSENSE');
				} else {
					if (/\bfusion\b/i.test(mutations)) {
						d.mut_type = 'FUSION';
					} else if ((/^[A-z]([0-9]+)[A-z]$/g).test(mutations)) {
						d.mut_type = 'MISSENSE';
					} else if ((/^([A-Z]+)([0-9]+)((del)|(ins))$/g).test(mutations)) {
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

	var makePatientData__Gene = function(sample_data) {
		var ret = {};
		// TEMPORARY: just use an arbitrary sample. TODO: fix this properly
		_.each(sample_data, function (d) {
			var new_datum = $.extend(true, {}, d);
			var patient_id = sample_to_patient[d.sample];
			ret[patient_id] = new_datum;
			delete new_datum['sample'];
			new_datum.patient = patient_id;
		});
		return _.map(Object.keys(ret), function (k) {
			return ret[k];
		});
	};
	var makePatientData__Clinical = function(sample_data, aggregation_method) {
		var ret = {};
		if (aggregation_method === 'category') {
			_.each(sample_data, function (d) {
				var patient_id = sample_to_patient[d.sample];
				ret[patient_id] = ret[patient_id] || {'patient': patient_id, attr_id: d.attr_id, 'value_counts': {}, 'num_samples': 0};
				ret[patient_id]['num_samples'] += 1;
				var value_counts = ret[patient_id]['value_counts'];
				var attr_val = d.attr_val;
				value_counts[attr_val] = value_counts[attr_val] || 0;
				value_counts[attr_val] += 1;
				ret[patient_id].attr_val = Object.keys(value_counts).length > 1 ? 'Mixed' : d.attr_val;
			});
		} else if (aggregation_method === 'average') {
			_.each(sample_data, function (d) {
				var patient_id = sample_to_patient[d.sample];
				ret[patient_id] = ret[patient_id] || {'patient': patient_id, attr_id: d.attr_id, 'attr_val': 0, 'num_samples': 0};
				ret[patient_id]['num_samples'] += 1;
				ret[patient_id]['attr_val'] += d.attr_val;
			});
			_.each(ret, function (datum, k) {
				datum.attr_val /= datum.num_samples;
			});
		}
		return _.map(Object.keys(ret), function (k) {
			return ret[k];
		});
	};
	var addBlankData__Clinical = function(data, attr_id, id_key, ids) {
		var ret = data.slice();
		var seen = {};
		_.each(ids, function (id) {
			seen[id] = false;
		});
		_.each(data, function (d) {
			seen[d[id_key]] = true;
		});
		_.each(seen, function (val, id) {
			if (!val) {
				var new_datum = {attr_id: attr_id, attr_val: 'NA'};
				new_datum[id_key] = id;
				ret.push(new_datum);
			}
		});
		return ret;
	};
	
	var oncoprint;
	var sample_data__gene = {};
	var patient_data__gene = {};
	var sample_data__clinical = {};
	var patient_data__clinical = {};
	
	var using_sample_data = false;
	var clinical_legends_visible = false;
	var track_data_name = {};
	
	var gaTooltipSample, gaTooltipPatient, cTooltipSample, cTooltipPatient;
	
	var removeClinicalTrackHandler, selectClinicalAttributeHandler;
	
	var to_qtip_destroy = [];
	
	(function initOncoprint() {
		oncoprint = window.Oncoprint.create(ctr_selector);
		oncoprint.setTrackGroupSortOrder([1,0]);
		$(ctr_selector).show();
	})();
	(function createUtilityFns() {
		var oncoprint_covering_block = $('<div>').appendTo(ctr_selector);;
		oncoprint_covering_block.css({'position':'absolute', 'left':'0px', 'top': '0px', 'display':'none'});
		
		oncoprintFadeTo = function (f) {
			oncoprint_covering_block.css({'display':'block', 'width':$('#oncoprint').width()+'px', 'height':$('#oncoprint').height()+'px'});
			$(config.toolbar_selector).fadeTo('fast', f);
			return $.when($(ctr_selector + ' .oncoprint-content-area').fadeTo('fast', f));
		};
		oncoprintFadeIn = function () {
			oncoprint_covering_block.css({'display':'none'});
			$(config.toolbar_selector).fadeTo('fast', 1);
			return $.when($(ctr_selector + ' .oncoprint-content-area').fadeTo('fast', 1));
		};
		sampleViewUrl = function(sample_id) {
			var href = cbio.util.getLinkToSampleView(window.cancer_study_id_selected,sample_id);
			return href;
		};
		patientViewUrl = function(patient_id) {
			var href = cbio.util.getLinkToPatientView(window.cancer_study_id_selected, patient_id);
			return href;
		};
	})();

	(function createTooltips() {
		var gaTooltip = function (d, is_sample_data) {
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
			if (is_sample_data) {
				ret += '<a href="' + sampleViewUrl(d.sample) + '">' + d.sample + '</a>';
			} else {
				ret += '<a href="' + patientViewUrl(d.patient) + '">' + d.patient + '</a>';
			}
			return ret;
		};
		gaTooltipSample = function (d) {
			return gaTooltip(d, true);
		};
		gaTooltipPatient = function (d) {
			return gaTooltip(d, false);
		};
		cTooltipSample = function (d) {
			var ret = '';
			ret += 'value: <b>' + d.attr_val + '</b><br>'
			ret += '<a href="' + sampleViewUrl(d.sample) + '">' + d.sample + '</a>';
			return ret;
		};
		cTooltipPatient = function (d) {
			var ret = '';
			ret += 'There are <b>' + d.num_samples + '</b> samples<br>';
			if (d.value_counts) {
				_.each(d.value_counts, function (count, value) {
					ret += '<b>' + value + ': ' + count + '</b><br>';
				});
			} else {
				ret += 'value: <b>' + d.attr_val + '</b><br>';
			}
			ret += '<a href="' + patientViewUrl(d.patient) + '">' + d.patient + '</a>';
			return ret;
		};
	})();
	(function createGeneticAlterationTracks() {
		var genes = {};
		_.each(gene_data, function (d) {
			genes[d.gene] = true;
		});
		genes = Object.keys(genes);
		_.each(gene_data, function (d) {
			var gene = d.gene;
			sample_data__gene[gene] = sample_data__gene[gene] || [];
			sample_data__gene[gene].push(d);
		});
		_.each(sample_data__gene, function (data, gene) {
			sample_data__gene[gene] = annotateMutationTypes(data);
			patient_data__gene[gene] = annotateMutationTypes(makePatientData__Gene(data));
		});
		
		(function populateOncoprintWithProgressUpdates() {
			oncoprintFadeTo(0.5).then(function() {
				oncoprint.suppressRendering();
				var numDataPts = _.reduce(_.map(Object.keys(patient_data__gene), function (gene) {
					return patient_data__gene[gene].length;
				}), function (a, b) {
					return a + b;
				}, 0);
				var numDataPtsAdded = 0;
				var loading_indicator_div = d3.select(ctr_selector).insert('div', ':first-child');
				var loading_indicator_text = loading_indicator_div.append('p').node();
				var loading_indicator_rect = loading_indicator_div.append('svg').attr('width', '200px').attr('height', '20px')
					.style('outline', '1px').style('outline', '1px solid #888888')
					.append('rect').attr('fill', "#1974b8").attr('height', '20px').node();

				var updateProgressIndicator = function (done_adding) {
					if (done_adding) {
						loading_indicator_text.innerHTML = "Rendering... (this may take a few seconds)";
						loading_indicator_rect.setAttribute('width', '200px');
						loading_indicator_rect.setAttribute('fill', '#00ff00');
					} else {
						loading_indicator_text.innerHTML = "";
						loading_indicator_rect.setAttribute('width', Math.ceil(200 * numDataPtsAdded / numDataPts) + 'px');
					}
				};
				updateProgressIndicator();

				var track_created = false;
				var geneIndex = 0;
				var addGeneData = function (gene) {
					// We do it like this, recursive and with setTimeouts, because we want the browser to
					//	render the progress message, and if we do this in a loop or do a recursive call
					//	in the same thread, then the browser doesn't actually do the rendering. We need
					//	to force it to render by putting the recursive call on the back of the execution queue.
					var data = patient_data__gene[gene];
					var new_track = oncoprint.addTrack({label: gene, tooltip: gaTooltipPatient});
					track_data_name[new_track] = gene;
					if (track_created === false) {
						oncoprint.setRuleSet(new_track, 'genetic_alteration');
						track_created = new_track;
					} else {
						oncoprint.useSameRuleSet(new_track, track_created);
					}
					genetic_alteration_tracks.push(new_track);
					oncoprint.setTrackData(new_track, data);
					numDataPtsAdded += data.length;
					updateProgressIndicator();
					geneIndex += 1;
					if (geneIndex < genes.length) {
						setTimeout(function () {
							addGeneData(genes[geneIndex]);
						}, 0);
					} else {
						updateProgressIndicator(true);
						setTimeout(function () {
							oncoprint.releaseRendering();
							loading_indicator_div.remove();
							oncoprint.setSortConfig({type: 'track'});
							oncoprint.sort();
							$(config.toolbar_selector).show();
							oncoprintFadeIn();
						}, 0);
					}
					;
				}
				addGeneData(genes[geneIndex]);
			});
		})();
	})();
	(function setUpToolbar() {
		var unaltered_cases_hidden = false;
		var using_sample_data = false;
		var hideUnalteredIds = function () {
			var unaltered_ids = oncoprint.getFilteredIdOrder(function (d_list) {
				return _.filter(d_list, function (d) {
					// unaltered gene data iff only keys are gene, sample/patient
					return Object.keys(d).length > 2;
				}).length === 0;
			}, genetic_alteration_tracks);
			oncoprint.hideIds(unaltered_ids, true);
		};
		var updatePercentAlteredIndicator = function() {
			if (!using_sample_data) {
				var altered_patient_count = _.uniq(_.map(splitIdString(window.PortalGlobals.getAlteredSampleIdList()), function(x) {
					return sample_to_patient[x];
				})).length;
				var unaltered_patient_count = _.uniq(_.map(splitIdString(window.PortalGlobals.getUnalteredSampleIdList()), function(x) {
					return sample_to_patient[x];
				})).length;
				var total_patient_count = altered_patient_count + unaltered_patient_count;
				var percent_altered = Math.ceil(100 * altered_patient_count / total_patient_count);
				$('#altered_value').text("Altered in " + altered_patient_count + " (" + percent_altered + "%) of " + total_patient_count + " cases/patients");
			} else {
				$('#altered_value').text("Altered in "+ window.PortalGlobals.getNumOfAlteredCases() + " ("+ Math.ceil(window.PortalGlobals.getPercentageOfAlteredCases()) +"%) of "+ window.PortalGlobals.getNumOfTotalCases() + " samples");
			}
		};
		
		var toolbar_selector = config.toolbar_selector;
		var setUpToolbarBtnHover = function($elt) {
			$elt.hover(function() {
				$(this).css({'fill':'#0000FF',
					'font-size': '18px',
					'cursor': 'pointer'});
				},
				function () {
					$(this).css({'fill': '#87CEFA',
						'font-size': '12px'});
				}
			);
		};
		(function setUpClinicalAttributesSelector() {
			var clinicalAttributesColl = new ClinicalAttributesColl();
			var unused_clinical_attrs = [];
			var clinical_track_attrs = {};
			
			var populateSelectorChosen = function () {
				utils.populate_clinical_attr_select($(toolbar_selector + ' #select_clinical_attributes')[0], unused_clinical_attrs);
				$(toolbar_selector + " #select_clinical_attributes").val('').trigger("liszt:updated");
			};
			clinicalAttributesColl.fetch({
				type: 'POST',
				data: {cancer_study_id: config.cancer_study_id,
					case_list: config.sample_list
				},
				success: function (attrs) {
					unused_clinical_attrs = _.sortBy(attrs.toJSON(), function (o) {
						return o.display_name;
					});
					if (window.PortalGlobals.getMutationProfileId() !== null) {
						unused_clinical_attrs.unshift({attr_id: "# mutations",
							datatype: "NUMBER",
							description: "Number of mutations",
							display_name: "# mutations",
						});
					}

					if (window.PortalGlobals.getCancerStudyId() !== null) {
						unused_clinical_attrs.unshift({attr_id: "FRACTION_GENOME_ALTERED",
							datatype: "NUMBER",
							description: "Fraction Genome Altered",
							display_name: "Fraction Genome Altered"
						});
					}

					for (var i = 0, _len = unused_clinical_attrs.length; i < _len; i++) {
						unused_clinical_attrs[i].display_order = i;
					}
					populateSelectorChosen();
					$(toolbar_selector + ' #select_clinical_attributes').chosen({width: "330px", "font-size": "12px", search_contains: true});

					$(toolbar_selector + ' #select_clinical_attributes_chzn .chzn-search input').click(
						function (e) {
							e.stopPropagation();
						}
					);

					$(toolbar_selector + " #select_clinical_attributes_chzn").mouseenter(function () {
						$(toolbar_selector + " #select_clinical_attributes_chzn .chzn-search input").focus();
					});
					$(toolbar_selector + " #select_clinical_attributes_chzn").addClass("chzn-with-drop");
				}
			});
			
			removeClinicalTrackHandler = function (evt, data) {
				var attr = clinical_track_attrs[data.track_id];
				delete clinical_track_attrs[data.track_id];
				delete track_data_name[data.track_id];
				clinical_tracks.splice(clinical_tracks.indexOf(data.track_id), 1);
				unused_clinical_attrs.push(attr);
				unused_clinical_attrs = _.sortBy(unused_clinical_attrs, function (o) {
					return o.display_order;
				});
				if (Object.keys(clinical_track_attrs).length === 0) {
					$(toolbar_selector + ' #oncoprint-diagram-showlegend-icon').css('display', 'none');
				}
				populateSelectorChosen();
			};
			$(oncoprint).on('remove_track.oncoprint', removeClinicalTrackHandler);
			var addClinicalTrack = function (clinical_attr) {
				var new_track;
				if (clinical_attr.attr_id === "# mutations") {
					var mutation_count_data = (using_sample_data ? sample_data__clinical : patient_data__clinical)[clinical_attr.attr_id];
					new_track = oncoprint.addTrack({label: '# Mutations (Log scale)', tooltip: (using_sample_data ? cTooltipSample : cTooltipPatient), cell_height: 15.33, removable: true, sort_direction_changable: true, datum_id_key: (using_sample_data ? "sample" : "patient")}, 0);
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
					var data = (using_sample_data ? sample_data__clinical : patient_data__clinical)[clinical_attr.attr_id];
					new_track = oncoprint.addTrack({label: clinical_attr.display_name, tooltip: (using_sample_data ? cTooltipSample : cTooltipPatient), cell_height: 15.33, removable: true, sort_direction_changable: true, datum_id_key: (using_sample_data ? "sample" : "patient")}, 0);
					if (clinical_attr.datatype.toLowerCase() === "number") {
						oncoprint.setRuleSet(new_track, 'gradient_color', {
							data_key: 'attr_val',
							color_range: ['#ffffff', '#c97894'],
							legend_label: clinical_attr.display_name,
							na_color: '#d3d3d3'
						});
					} else {
						oncoprint.setRuleSet(new_track, 'categorical_color', {
							legend_label: clinical_attr.display_name,
							getCategory: function (d) {
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
				var attr_index = _.indexOf(_.pluck(unused_clinical_attrs, 'attr_id'), clinical_attr.attr_id);
				unused_clinical_attrs.splice(attr_index, 1);

				populateSelectorChosen();

				clinical_tracks.push(new_track);
				clinical_track_attrs[new_track] = clinical_attr;
				track_data_name[new_track] = clinical_attr.attr_id;
				oncoprint.setLegendVisible(new_track, clinical_legends_visible);
			};

			$(toolbar_selector + ' #oncoprint_diagram_showmorefeatures_icon').qtip({
				content: {text: 'Add another clinical attribute track'},
				position: {my: 'bottom middle', at: 'top middle', viewport: $(window)},
				style: {classes: 'qtip-light qtip-rounded qtip-shadow qtip-lightwhite'},
				show: {event: "mouseover"},
				hide: {fixed: true, delay: 100, event: "mouseout"}
			});
			to_qtip_destroy.push($(toolbar_selector + ' #oncoprint_diagram_showmorefeatures_icon'));
			
			$(toolbar_selector + ' #oncoprint_diagram_showmorefeatures_icon').click(function () {
				$(toolbar_selector + ' #select_clinical_attributes_chzn').addClass("chzn-with-drop");
			});
			$(toolbar_selector + " #select_clinical_attributes_chzn").mouseenter(function () {
				$(toolbar_selector + " #select_clinical_attributes_chzn .chzn-search input").focus();
			});
			selectClinicalAttributeHandler = function (evt) {
				if ($(toolbar_selector + ' #select_clinical_attributes').val().trim() === '') {
					evt.stopPropagation();
					return;
				}
				oncoprintFadeTo(0.5);
				$(oncoprint).one('finished_rendering.oncoprint', function () {
					$(toolbar_selector + ' #clinical_first').css('display', 'inline');
					$(toolbar_selector + ' #oncoprint-diagram-showlegend-icon').css('display', 'inline');
					oncoprintFadeIn();
				});
				var clinical_attr = $(toolbar_selector + ' #select_clinical_attributes option:selected')[0].__data__;
				$(toolbar_selector + ' #select_clinical_attributes').val('').trigger('liszt:updated');
				$(toolbar_selector + ' #clinical_dropdown').dropdown('toggle');
				if (clinical_attr.attr_id === undefined) {
					// selected "none"
				} else {
					if (sample_data__clinical.hasOwnProperty(clinical_attr.attr_id)) {
						addClinicalTrack(clinical_attr);
					} else {
						if (clinical_attr.attr_id === "# mutations") {
							var clinicalMutationColl = new ClinicalMutationColl();
							clinicalMutationColl.fetch({
								type: "POST",
								data: {
									mutation_profile: window.PortalGlobals.getMutationProfileId(),
									cmd: "count_mutations",
									case_ids: config.sample_list.join(" ")
								},
								success: function (response) {
									sample_data__clinical[clinical_attr.attr_id] = addBlankData__Clinical(response.toJSON(), clinical_attr.attr_id, 'sample', config.sample_list);
									patient_data__clinical[clinical_attr.attr_id] = makePatientData__Clinical(sample_data__clinical[clinical_attr.attr_id], 'average');
									addClinicalTrack(clinical_attr);
								}
							});
						} else if (clinical_attr.attr_id === "FRACTION_GENOME_ALTERED") {
							var clinicalCNAColl = new ClinicalCNAColl();
							clinicalCNAColl.fetch({
								type: "POST",
								data: {
									cancer_study_id: config.cancer_study_id,
									cmd: "get_cna_fraction",
									case_ids: config.sample_list.join(" ")
								},
								success: function (response) {
									sample_data__clinical[clinical_attr.attr_id] = addBlankData__Clinical(response.toJSON(), clinical_attr.attr_id, 'sample', config.sample_list);
									patient_data__clinical[clinical_attr.attr_id] = makePatientData__Clinical(sample_data__clinical[clinical_attr.attr_id], 'average');
									addClinicalTrack(clinical_attr);
								}
							});
						} else {
							var clinicalColl = new ClinicalColl();
							clinicalColl.fetch({
								type: "POST",
								data: {
									cancer_study_id: cancer_study_id,
									attribute_id: clinical_attr.attr_id,
									case_list: config.sample_list.join(" ")
								},
								success: function (response) {
									sample_data__clinical[clinical_attr.attr_id] = addBlankData__Clinical(response.toJSON(), clinical_attr.attr_id, 'sample', config.sample_list);
									patient_data__clinical[clinical_attr.attr_id] = makePatientData__Clinical(sample_data__clinical[clinical_attr.attr_id], 'category');
									addClinicalTrack(clinical_attr);
								}
							});
						}
					}
				}
			};
			$(toolbar_selector + ' #select_clinical_attributes').change(selectClinicalAttributeHandler);
		})();
		(function setUpZoom() {
			var zoom_elt = $(toolbar_selector + ' #oncoprint_diagram_slider_icon');
			var slider = $('<input>', {
				id: "oncoprint_zoom_slider",
				type: "range",
				width: "80",
				height: "16",
				min: 0,
				max: 1,
				step: 0.01,
				value: 1,
				change: function () {
					oncoprint.setZoom(this.value);
				}
			});
			zoom_elt.append(slider);
			setUpToolbarBtnHover(slider);
			slider.qtip({
				content: {text: 'Zoom in/out of oncoprint'},
				position: {my: 'bottom middle', at: 'top middle', viewport: $(window)},
				style: {classes: 'qtip-light qtip-rounded qtip-shadow qtip-lightwhite'},
				show: {event: "mouseover"},
				hide: {fixed: true, delay: 100, event: "mouseout"}
			});
			to_qtip_destroy.push(slider);
			
			var zoomStep = 0.05;
			$(toolbar_selector + ' #oncoprint_zoomout').click(function () {
				var slider = $('#oncoprint_whole_body #oncoprint_zoom_slider')[0];
				var currentZoom = parseFloat(slider.value);
				var newZoom = currentZoom - zoomStep;
				slider.value = Math.max(0, newZoom);
				$(slider).trigger('change');
			});
			$(toolbar_selector + ' #oncoprint_zoomin').click(function () {
				var slider = $(toolbar_selector + ' #oncoprint_zoom_slider')[0];
				var currentZoom = parseFloat(slider.value);
				var newZoom = currentZoom + zoomStep;
				slider.value = Math.min(1, newZoom);
				$(slider).trigger('change');
			});
		})();
		(function setUpToggleWhitespaceBtn() {
			var btn = $(toolbar_selector + ' #oncoprint-diagram-removeWhitespace-icon');
			var btn_img = btn.find('img')[0];
			var img_urls = ['images/removeWhitespace.svg', 'images/unremoveWhitespace.svg'];
			var curr_img_url_index = 0;
			btn.click(function () {
				oncoprint.toggleCellPadding();
				curr_img_url_index = +!curr_img_url_index;
				btn_img.attributes.src.value = img_urls[curr_img_url_index];
			});
			setUpToolbarBtnHover(btn);
			btn.qtip({
				content: {text: function () {
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
			to_qtip_destroy.push(btn);
		})();
		(function setUpRemoveUnalteredCasesBtn() {
			var btn = $(toolbar_selector + ' #oncoprint-diagram-removeUCases-icon');
			var imgs = ['images/removeUCases.svg', 'images/unremoveUCases.svg'];
			var descs = ['Hide unaltered cases', 'Show unaltered cases'];
			btn.click(function () {
				oncoprintFadeTo(0.5).then(function() {
					unaltered_cases_hidden = !unaltered_cases_hidden;
					btn.find('img').attr('src', imgs[+unaltered_cases_hidden]);
					if (!unaltered_cases_hidden) {
						oncoprint.showIds();
					} else {
						hideUnalteredIds();
					}
					oncoprintFadeIn();
				});
			});
			btn.qtip({
				content: {text: function () {
						return descs[+unaltered_cases_hidden];
					}},
				position: {my: 'bottom middle', at: 'top middle', viewport: $(window)},
				style: {classes: 'qtip-light qtip-rounded qtip-shadow qtip-lightwhite'},
				show: {event: "mouseover"},
				hide: {fixed: true, delay: 100, event: "mouseout"}
			});
			to_qtip_destroy.push(btn);
		})();
		(function setUpTogglePatientSampleBtn() {
			var toolbar_btn = $(toolbar_selector + ' #oncoprint_diagram_topatientid_icon');
			var header_btn = $('#switchPatientSample');
			var imgs = ['images/cool2.svg', 'images/cool.svg'];
			var toolbar_descs = ['Show events per sample', 'Show events per patient'];
			var header_descs = ['Show samples in OncoPrint', 'Show patients in OncoPrint'];
			toolbar_btn.add(header_btn).click(function () {
				using_sample_data = !using_sample_data;
				toolbar_btn.find('img').attr('src', imgs[+using_sample_data]);
				header_btn.text(header_descs[+using_sample_data]);
				oncoprintFadeTo(0.5).then(function () {
					if (!using_sample_data) {
						oncoprint.setIdOrder([]);
						_.each(genetic_alteration_tracks, function (track_id) {
							oncoprint.setTrackDatumIdKey(track_id, 'patient');
							oncoprint.setTrackTooltip(track_id, gaTooltipPatient);
							oncoprint.setTrackData(track_id, patient_data__gene[track_data_name[track_id]]);
						});
						_.each(clinical_tracks, function (track_id) {
							oncoprint.setTrackDatumIdKey(track_id, 'patient');
							oncoprint.setTrackTooltip(track_id, cTooltipPatient);
							oncoprint.setTrackData(track_id, patient_data__clinical[track_data_name[track_id]]);
						});
						updatePercentAlteredIndicator();
						$(toolbar_selector + ' .oncoprint-sample-download').text("Patient order");
					} else {
						oncoprint.setIdOrder([]);
						_.each(genetic_alteration_tracks, function (track_id) {
							oncoprint.setTrackDatumIdKey(track_id, 'sample');
							oncoprint.setTrackTooltip(track_id, gaTooltipSample);
							oncoprint.setTrackData(track_id, sample_data__gene[track_data_name[track_id]]);
						});
						_.each(clinical_tracks, function (track_id) {
							oncoprint.setTrackDatumIdKey(track_id, 'sample');
							oncoprint.setTrackTooltip(track_id, cTooltipSample);
							oncoprint.setTrackData(track_id, sample_data__clinical[track_data_name[track_id]]);
						});
						updatePercentAlteredIndicator();
						$(toolbar_selector + ' .oncoprint-sample-download').text("Sample order");
					}
					if (unaltered_cases_hidden) {
						hideUnalteredIds();
					}
					oncoprint.sort();
					oncoprintFadeIn();
				});
			});
			toolbar_btn.qtip({
				content: {text: function () {
						return toolbar_descs[+using_sample_data];
					}},
				position: {my: 'bottom middle', at: 'top middle', viewport: $(window)},
				style: {classes: 'qtip-light qtip-rounded qtip-shadow qtip-lightwhite'},
				show: {event: "mouseover"},
				hide: {fixed: true, delay: 100, event: "mouseout"}
			});
			to_qtip_destroy.push(toolbar_btn);
		})();
		(function setUpShowLegendBtn() {
			var imgs = ['images/showlegend.svg', 'images/hidelegend.svg'];
			var qtip_text = ['Show legends for clinical attribute tracks', 'Hide legends for clinical attribute tracks'];
			$(toolbar_selector + ' #oncoprint-diagram-showlegend-icon').click(function () {
				clinical_legends_visible = !clinical_legends_visible;
				$(toolbar_selector + ' #oncoprint-diagram-showlegend-icon img').attr('src', imgs[+clinical_legends_visible]);
				oncoprint.setLegendVisible(clinical_tracks, clinical_legends_visible);
			});
			$(toolbar_selector + ' #oncoprint-diagram-showlegend-icon').qtip({
				content: {
					text: function () {
						return qtip_text[+clinical_legends_visible];
					}
				},
				position: {my: 'bottom middle', at: 'top middle', viewport: $(window)},
				style: {classes: 'qtip-light qtip-rounded qtip-shadow qtip-lightwhite'},
				show: {event: "mouseover"},
				hide: {fixed: true, delay: 100, event: "mouseout"}
			});
			to_qtip_destroy.push($(toolbar_selector + ' #oncoprint-diagram-showlegend-icon'));
			setUpToolbarBtnHover($('#oncoprint-diagram-showlegend-icon'));
		})();
		(function setUpSortBySelector() {
			$(toolbar_selector + ' #genes_first_a').click(function () {
				oncoprint.setTrackGroupSortOrder([1, 0]);
				oncoprint.setSortConfig({type: 'track'});
				oncoprint.sort();
			});
			$(toolbar_selector + ' #clinical_first_a').click(function () {
				oncoprint.setTrackGroupSortOrder([0, 1]);
				oncoprint.setSortConfig({type: 'track'});
				oncoprint.sort();
			});
			$(toolbar_selector + ' #alphabetically_first_a').click(function () {
				oncoprint.setSortConfig({type: 'id'});
				oncoprint.sort();
			});
			$(toolbar_selector + ' #user_defined_first_a').click(function () {
				var id_list = config.sample_list;
				var sample_to_patient = config.sample_to_patient;
				if (!using_sample_data) {
					id_list = _.uniq(_.map(id_list, function(x) {
						return sample_to_patient[x];
					}));
				}
				oncoprint.setIdOrder(id_list);
				oncoprint.setSortConfig({});
			});
		})();
		(function setUpMutationSettingsBtn() {
			// TODO: are we aware that these icon names are 100% unintelligible?
			var settings = [{color: true, order: false, next_setting_img: 'images/colormutations.svg', next_setting_desc: 'Color-code mutations and sort by type'},
				{color: true, order: true, next_setting_img: 'images/uncolormutations.svg', next_setting_desc: 'Show all mutations with the same color'},
				{color: false, order: false, next_setting_img: 'images/mutationcolorsort.svg', next_setting_desc: 'Color-code mutations but don\'t sort by type'}];
			var setting_index = 0;
			var updateBtn = function () {
				$(toolbar_selector + ' #oncoprint_diagram_showmutationcolor_icon').qtip('destroy', true);
				$(toolbar_selector + ' #oncoprint_diagram_showmutationcolor_icon img').attr('src', settings[setting_index].next_setting_img);
				$(toolbar_selector + ' #oncoprint_diagram_showmutationcolor_icon').qtip({
					content: {text: settings[setting_index].next_setting_desc},
					position: {my: 'bottom middle', at: 'top middle', viewport: $(window)},
					style: {classes: 'qtip-light qtip-rounded qtip-shadow qtip-lightwhite'},
					show: {event: "mouseover"},
					hide: {fixed: true, delay: 100, event: "mouseout"}
				});
				to_qtip_destroy.push($(toolbar_selector + ' #oncoprint_diagram_showmutationcolor_icon'));
			};
			$(toolbar_selector + ' #oncoprint_diagram_showmutationcolor_icon').click(function () {
				setting_index = (setting_index + 1) % settings.length;
				var new_params = {dont_distinguish_mutation_color: !settings[setting_index].color, distinguish_mutation_order: settings[setting_index].order};
				_.each(genetic_alteration_tracks, function (track_id, ind) {
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
			setUpToolbarBtnHover($(toolbar_selector + ' #oncoprint_diagram_showmutationcolor_icon'));
		})();
		(function setUpDownloadBtn() {
			$(toolbar_selector + ' #oncoprint-diagram-downloads-icon').qtip({
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

								cbio.download.initDownload(oncoprint.toSVG(false), downloadOptions);
							}
							else if (fileType === 'svg')
							{
								cbio.download.initDownload(oncoprint.toSVG(true), {filename: "oncoprint.svg"});
							}
						});

						$('.oncoprint-sample-download').click(function () {
							var idTypeStr = (using_sample_data ? "Sample" : "Patient");
							var content = idTypeStr + " order in the Oncoprint is: \n";
							content += oncoprint.getVisibleIdOrder().join('\n');
							var downloadOpts = {
								filename: 'OncoPrint' + idTypeStr + 's.txt',
								contentType: "text/plain;charset=utf-8",
								preProcess: false};

							// send download request with filename & file content info
							cbio.download.initDownload(content, downloadOpts);
						});
					}
				}
			});
			to_qtip_destroy.push($(toolbar_selector + ' #oncoprint-diagram-downloads-icon'));
		})();
		$('#oncoprint').hover(function () {
			$(toolbar_selector).stop().fadeTo(80, 1);
		}, function (evt) {
			$(toolbar_selector).stop().fadeOut(500);
		});
		updatePercentAlteredIndicator();
	})();
	return {
		destroy: function() {
			var toolbar_selector = config.toolbar_selector;
			d3.select(ctr_selector).selectAll('*').remove();
			$(oncoprint).off('remove_track.oncoprint', removeClinicalTrackHandler);
			$(toolbar_selector + ' #select_clinical_attributes').off('change', selectClinicalAttributeHandler);
			$(toolbar_selector + ' #oncoprint_zoomout').off('click');
			$(toolbar_selector + ' #oncoprint_zoomin').off('click');
			$(toolbar_selector + ' #oncoprint-diagram-removeWhitespace-icon').off('click');
			$(toolbar_selector + ' #oncoprint-diagram-removeUCases-icon').off('click');
			$(toolbar_selector + ' #oncoprint_diagram_topatientid_icon').off('click');
			$('#switchPatientSample').off('click');
			$(toolbar_selector + ' #oncoprint-diagram-showlegend-icon').off('click');
			$(toolbar_selector + ' #genes_first_a').off('click');
			$(toolbar_selector + ' #clinical_first_a').off('click');
			$(toolbar_selector + ' #alphabetically_first_a').off('click');
			$(toolbar_selector + ' #user_defined_first_a').off('click');
			$(toolbar_selector + ' #oncoprint_diagram_showmutationcolor_icon').off('click');
		
			_.each(to_qtip_destroy, function($elt) {
				$elt.qtip('destroy', true);
			});
		}
	};
};

// This is for the moustache-like templates
// prevents collisions with JSP tags
_.templateSettings = {
	interpolate: /\{\{(.+?)\}\}/g
};
$('#oncoprint_controls').html(_.template($('#main-controls-template').html())());

var geneDataColl = new GeneDataColl();

geneDataColl.fetch({
	type: "POST",
	data: {
		cancer_study_id: cancer_study_id_selected,
		oql: $('#gene_list').val(),
		case_list: window.PortalGlobals.getCases(),
		geneticProfileIds: window.PortalGlobals.getGeneticProfiles(),
		z_score_threshold: window.PortalGlobals.getZscoreThreshold(),
		rppa_score_threshold: window.PortalGlobals.getRppaScoreThreshold()
	},
	success: function (response) {
		(function invokeDataManager() {
			var genes = {};
			_.each(response.models, function(d) {
				genes[d.attributes.gene] = true;
			});
			genes = Object.keys(genes);
			window.PortalGlobals.setGeneData(geneDataColl.toJSON());
			window.PortalDataColl.setOncoprintData(utils.process_data(response.toJSON(), genes));
			PortalDataColl.setOncoprintStat(utils.alteration_info(geneDataColl.toJSON()));
		})();
		$('#outer_loader_img').hide();
		$('#oncoprint #everything').show();
		window.onc_obj = setUpOncoprint('oncoprint_body', {
			sample_to_patient: window.PortalGlobals.getPatientSampleIdMap(),
			gene_data: response.toJSON(),
			toolbar_selector: '#oncoprint-diagram-toolbar-buttons',
			sample_list: window.PortalGlobals.getCases().trim().split(/\s+/),
			cancer_study_id: cancer_study_id_selected
		});
	}
});