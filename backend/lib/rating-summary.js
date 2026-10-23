'use strict';
module.exports=(assignment,scores)=>{
 const required=Number(assignment.required_students),responses=Number(assignment.response_count);
 const positive=scores.filter(x=>Number(x.score)>=3.5).length;
 const negative=scores.filter(x=>Number(x.score)<2.5).length;
 return {required,responses,remaining:Math.max(0,required-responses),final:responses>=required,positive,neutral:scores.length-positive-negative,negative};
};
